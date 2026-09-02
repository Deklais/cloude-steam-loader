import { FC, JSX, ReactElement, ReactNode, cloneElement, createElement, useEffect } from 'react';
import type { Route } from 'react-router';

import { CloudeGlobalComponentsState, CloudeGlobalComponentsStateContextProvider, useCloudeGlobalComponentsState } from './GlobalComponentsState';
import { CloudeRouterState, CloudeRouterStateContextProvider, RoutePatch, RouterEntry, useCloudeRouterState } from './CloudeRouterState';
import { Logger } from '../../logger';
import { EUIMode } from '../../globals/steam-client/shared';
import { afterPatch, findInReactTree, findInTree, getReactRoot, injectFCTrampoline, Patch, sleep, wrapReactType } from '../../utils';
import { findModuleByExport } from '../../webpack';
import { ErrorBoundary } from '../../components';

declare global {
	interface Window {
		__ROUTER_HOOK_INSTANCE: any;
	}
}

const isPatched = Symbol('is patched');

class RouterHook extends Logger {
	private routerState: CloudeRouterState = new CloudeRouterState();
	private globalComponentsState: CloudeGlobalComponentsState = new CloudeGlobalComponentsState();
	private renderedComponents = new Map<EUIMode, ReactElement[]>([
		[EUIMode.GamePad, []],
		[EUIMode.Desktop, []],
	]);
	private Route: any;
	private DesktopRoute: any;
	private wrappedDesktopLibraryMemo?: any;
	private CloudeGamepadRouterWrapper = this.gamepadRouterWrapper.bind(this);
	private CloudeDesktopRouterWrapper = this.desktopRouterWrapper.bind(this);
	private CloudeGlobalComponentsWrapper = this.globalComponentsWrapper.bind(this);
	private toReplace = new Map<string, ReactNode>();
	private desktopRouterPatch?: Patch;
	private gamepadRouterPatch?: Patch;
	private modeChangeRegistration?: any;
	private patchedModes = new Set<number>();
	public routes?: any[];

	private setupListeners: (() => void)[] = [];
	private isSetupEmitted = false;

	constructor() {
		super('RouterHook');

		window.__ROUTER_HOOK_INSTANCE?.deinit?.();
		window.__ROUTER_HOOK_INSTANCE = this;

		const reactRouterStackModule = findModuleByExport((e) => e == 'router-backstack', 20);
		if (reactRouterStackModule) {
			this.Route =
				Object.values(reactRouterStackModule).find((e) => typeof e == 'function' && /routePath:.\.match\?\.path./.test(e.toString())) ||
				Object.values(reactRouterStackModule).find((e) => typeof e == 'function' && /routePath:null===\(.=.\.match\)/.test(e.toString()));
			if (!this.Route) {
				this.error('Failed to find Route component');
			}
		} else {
			this.error('Failed to find router stack module');
		}

		const routerModule = findModuleByExport((e) => e?.displayName == 'Router');
		if (routerModule) {
			this.DesktopRoute = Object.values(routerModule).find(
				(e) =>
					typeof e == 'function' &&
					e?.prototype?.render?.toString()?.includes('props.computedMatch') &&
					e?.prototype?.render?.toString()?.includes('.Children.count('),
			);
			if (!this.DesktopRoute) {
				this.error('Failed to find DesktopRoute component');
			}
		} else {
			this.error('Failed to find router module, desktop routes will not work');
		}

		this.modeChangeRegistration = SteamClient.UI.RegisterForUIModeChanged((mode: EUIMode) => {
			this.debug(`UI mode changed to ${mode}`);
			if (this.patchedModes.has(mode)) return;
			this.patchedModes.add(mode);
			this.debug(`Patching router for UI mode ${mode}`);
			switch (mode) {
				case EUIMode.GamePad:
					this.debug('Patching gamepad router');
					this.patchGamepadRouter();
					break;
				// Not fully implemented yet
				case EUIMode.Desktop:
					this.debug('Patching desktop router');
					this.patchDesktopRouter();
					break;
				default:
					this.warn(`Router patch not implemented for UI mode ${mode}`);
					break;
			}
		});
	}

	private async patchGamepadRouter() {
		const root = getReactRoot(document.getElementById('root') as any);
		const findRouterNode = () => findInReactTree(root, (node) => typeof node?.pendingProps?.loggedIn == 'undefined' && node?.type?.toString().includes('Settings.Root()'));
		await this.waitForUnlock();
		let routerNode = findRouterNode();
		while (!routerNode) {
			await sleep(1);
			await this.waitForUnlock();
			routerNode = findRouterNode();
		}
		if (routerNode) {
			// Patch the component globally
			this.gamepadRouterPatch = afterPatch(routerNode.elementType, 'type', this.handleGamepadRouterRender.bind(this));
			// Swap out the current instance
			routerNode.type = routerNode.elementType.type;
			if (routerNode?.alternate) {
				routerNode.alternate.type = routerNode.type;
			}
			// Force a full rerender via our custom error boundary
			const errorBoundaryNode = findInTree(routerNode, (e) => e?.stateNode?._cloudeForceRerender, {
				walkable: ['return'],
			});

			errorBoundaryNode?.stateNode?._cloudeForceRerender?.();
		}
	}

	private async patchDesktopRouter() {
		const root = getReactRoot(document.getElementById('root') as any);
		const findRouterNode = () =>
			findInReactTree(root, (node) => {
				const typeStr = node?.elementType?.toString?.();
				return (
					typeStr &&
					typeStr?.includes('.IsMainDesktopWindow') &&
					typeStr?.includes('bShowDesktopUIContent') &&
					typeStr?.includes('bShowSuperNav') &&
					typeStr?.includes('bShowTitleBarControls')
				);
			});
		let routerNode = findRouterNode();
		while (!routerNode) {
			await sleep(1);
			routerNode = findRouterNode();
		}
		if (routerNode) {
			console.log('Found desktop router node', routerNode);

			// Patch the component globally
			const patchedRenderer = injectFCTrampoline(routerNode.elementType);
			this.desktopRouterPatch = afterPatch(patchedRenderer, 'component', this.handleDesktopRouterRender.bind(this));
			// Force a full rerender via our custom error boundary
			const errorBoundaryNode = findInTree(routerNode, (e) => e?.stateNode?._cloudeForceRerender, {
				walkable: ['return'],
			});

			// @ts-ignore
			window.CLOUDE_STEAM_FORCE_RERENDER = () => errorBoundaryNode?.stateNode?._cloudeForceRerender?.();
			errorBoundaryNode?.stateNode?._cloudeForceRerender?.();
		}
	}

	public async emitRouterSetup() {
		this.debug('Emitting router setup');
		if (this.setupListeners.length > 0) {
			this.setupListeners.forEach((cb) => cb());
			this.setupListeners = [];
		} else {
			this.debug('No router setup listeners registered');
		}
		this.isSetupEmitted = true;
	}

	public async registerForRouterSetup(callback: () => void) {
		if (this.isSetupEmitted) {
			callback();
			return;
		}

		this.setupListeners.push(callback);
		this.debug('Registered router setup listener');
	}

	public async waitForUnlock() {
		try {
			while (window?.securitystore?.IsLockScreenActive?.()) {
				await sleep(500);
			}
		} catch (e) {
			this.warn('Error while checking if unlocked:', e);
		}
	}

	public handleDesktopRouterRender(_: any, ret: any) {
		const CloudeDesktopRouterWrapper = this.CloudeDesktopRouterWrapper;
		const CloudeGlobalComponentsWrapper = this.CloudeGlobalComponentsWrapper;
		this.debug('desktop router render', ret);
		if (ret._cloude) {
			return ret;
		}

		const component = () => {
			useEffect(() => {
				this.debug('Desktop router rendered, emitting setup');
				setTimeout(this.emitRouterSetup.bind(this), 250);
			}, []);

			return (
				<>
					<CloudeRouterStateContextProvider cloudeRouterState={this.routerState}>
						<CloudeDesktopRouterWrapper>{ret}</CloudeDesktopRouterWrapper>
					</CloudeRouterStateContextProvider>
					<CloudeGlobalComponentsStateContextProvider cloudeGlobalComponentsState={this.globalComponentsState}>
						<CloudeGlobalComponentsWrapper uiMode={EUIMode.Desktop} />
					</CloudeGlobalComponentsStateContextProvider>
				</>
			);
		};

		(component() as any)._cloude = true;
		return component();
	}

	public handleGamepadRouterRender(_: any, ret: any) {
		const CloudeGamepadRouterWrapper = this.CloudeGamepadRouterWrapper;
		const CloudeGlobalComponentsWrapper = this.CloudeGlobalComponentsWrapper;
		console.log('gamepad router render', ret);

		if (ret._cloude) {
			return ret;
		}
		const returnVal = (
			<>
				<CloudeRouterStateContextProvider cloudeRouterState={this.routerState}>
					<CloudeGamepadRouterWrapper>{ret}</CloudeGamepadRouterWrapper>
				</CloudeRouterStateContextProvider>
				<CloudeGlobalComponentsStateContextProvider cloudeGlobalComponentsState={this.globalComponentsState}>
					<CloudeGlobalComponentsWrapper uiMode={EUIMode.GamePad} />
				</CloudeGlobalComponentsStateContextProvider>
			</>
		);
		(returnVal as any)._cloude = true;
		return returnVal;
	}

	private globalComponentsWrapper({ uiMode }: { uiMode: EUIMode }) {
		const { components } = useCloudeGlobalComponentsState();
		const componentsForMode = components.get(uiMode);
		if (!componentsForMode) {
			this.warn(`Couldn't find global components map for uimode ${uiMode}`);
			return null;
		}
		if (!this.renderedComponents.has(uiMode) || this.renderedComponents.get(uiMode)?.length != componentsForMode.size) {
			this.debug('Rerendering global components for uiMode', uiMode);
			this.renderedComponents.set(
				uiMode,
				Array.from(componentsForMode.values()).map((GComponent) => <GComponent />),
			);
		}
		return <>{this.renderedComponents.get(uiMode)}</>;
	}

	private gamepadRouterWrapper({ children }: { children: ReactElement }) {
		// Used to store the new replicated routes we create to allow routes to be unpatched.
		const { routes, routePatches } = useCloudeRouterState();

		// TODO make more redundant
		if (!(children?.props as any)?.children?.[0]?.props?.children) {
			this.debug('routerWrapper wrong component?', children);
			return children;
		}
		const mainRouteList = (children as any).props.children[0].props.children;
		const ingameRouteList = (children as any).props.children[1].props.children; // /appoverlay and /apprunning
		this.processList(mainRouteList, routes, routePatches.get(EUIMode.GamePad), true, this.Route);
		this.processList(ingameRouteList, null, routePatches.get(EUIMode.GamePad), false, this.Route);
		this.debug('Rerendered gamepadui routes list');
		return children;
	}

	private desktopRouterWrapper({ children }: { children: ReactElement }) {
		// Used to store the new replicated routes we create to allow routes to be unpatched.
		const { routes, routePatches } = useCloudeRouterState();

		const mainRouteList = findInReactTree(children, (node) => node?.length > 2 && node?.find((elem: any) => elem?.props?.path == '/console'));
		if (!mainRouteList) {
			this.debug('routerWrapper wrong component?', children);
			return children;
		}
		this.processList(mainRouteList, routes, routePatches.get(EUIMode.Desktop), true, this.DesktopRoute);
		const libraryRouteWrapper = mainRouteList.find((r: any) => r?.props && 'cm' in r.props && 'bShowDesktopUIContent' in r.props);

		if (!this.wrappedDesktopLibraryMemo) {
			wrapReactType(libraryRouteWrapper);
			afterPatch(libraryRouteWrapper.type, 'type', (_, ret) => {
				const { routePatches } = useCloudeRouterState();
				const libraryRouteList = findInReactTree(ret, (node) => node?.length > 1 && node?.find((elem: any) => elem?.props?.path == '/library/downloads'));

				if (!libraryRouteList) {
					this.warn('failed to find library route list', ret);
					return ret;
				}
				this.processList(libraryRouteList, null, routePatches.get(EUIMode.Desktop), false, this.DesktopRoute);
				return ret;
			});
			this.wrappedDesktopLibraryMemo = libraryRouteWrapper.type;
		} else {
			libraryRouteWrapper.type = this.wrappedDesktopLibraryMemo;
		}

		this.debug('Rerendered desktop routes list');
		return children;
	}

	private processList(
		routeList: any[],
		routes: Map<string, RouterEntry> | null | undefined,
		routePatches: Map<string, Set<RoutePatch>> | null | undefined,
		save: boolean,
		RouteComponent: any,
	) {
		this.debug('Route list: ', routeList);
		if (save) this.routes = routeList;
		let routerIndex = routeList.length;
		if (routes) {
			if (!routeList[routerIndex - 1]?.length || routeList[routerIndex - 1]?.length !== routes.size) {
				if (routeList[routerIndex - 1]?.length && routeList[routerIndex - 1].length !== routes.size) routerIndex--;
				const newRouterArray: (ReactElement | JSX.Element)[] = [];
				routes.forEach(({ component, props }, path) => {
					newRouterArray.push(
						<RouteComponent path={path} {...props}>
							<ErrorBoundary>{createElement(component)}</ErrorBoundary>
						</RouteComponent>,
					);
				});
				routeList[routerIndex] = newRouterArray;
			}
		}

		// if (!routePatches) {
		// 	return;
		// }

		routeList.forEach((route: Route, index: number) => {
			const replaced = this.toReplace.get(route?.props?.path as string);
			if (replaced) {
				routeList[index].props.children = replaced;
				this.toReplace.delete(route?.props?.path as string);
			}

			if (route?.props?.path && routePatches?.has(route.props.path as string)) {
				this.toReplace.set(
					route?.props?.path as string,
					// @ts-ignore
					routeList[index].props.children,
				);
				routePatches?.get(route.props.path as string)?.forEach((patch) => {
					const oType = routeList[index].props.children.type;
					routeList[index].props.children = patch({
						...routeList[index].props,
						children: {
							...cloneElement(routeList[index].props.children),
							type: routeList[index].props.children[isPatched] ? oType : (props) => createElement(oType, props),
						},
					}).children;
					routeList[index].props.children[isPatched] = true;
				});
			}
		});
	}

	addRoute(path: string, component: RouterEntry['component'], props: RouterEntry['props'] = {}) {
		this.routerState.addRoute(path, component, props);
	}

	addPatch(path: string, patch: RoutePatch, uiMode: EUIMode = EUIMode.Desktop) {
		return this.routerState.addPatch(path, patch, uiMode);
	}

	addGlobalComponent(name: string, component: FC, uiMode: EUIMode = EUIMode.Desktop) {
		this.globalComponentsState.addComponent(name, component, uiMode);
	}

	removeGlobalComponent(name: string, uiMode: EUIMode = EUIMode.Desktop) {
		this.globalComponentsState.removeComponent(name, uiMode);
	}

	removePatch(path: string, patch: RoutePatch, uiMode: EUIMode = EUIMode.Desktop) {
		this.routerState.removePatch(path, patch, uiMode);
	}

	removeRoute(path: string) {
		this.routerState.removeRoute(path);
	}

	deinit() {
		this.modeChangeRegistration?.unregister();
		this.gamepadRouterPatch?.unpatch();
		this.desktopRouterPatch?.unpatch();
	}
}

export default RouterHook;
