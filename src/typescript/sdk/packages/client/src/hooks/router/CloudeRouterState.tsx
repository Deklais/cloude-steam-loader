import { ComponentType, FC, ReactNode, createContext, useContext, useEffect, useState } from 'react';
import type { RouteProps } from 'react-router';
import { EUIMode } from '../../globals/steam-client/shared';

export interface RouterEntry {
	props: Omit<RouteProps, 'path' | 'children'>;
	component: ComponentType;
}

export type RoutePatch = (route: RouteProps) => RouteProps;

interface PublicCloudeRouterState {
	routes: Map<string, RouterEntry>;
	routePatches: Map<EUIMode, Map<string, Set<RoutePatch>>>;
}

export class CloudeRouterState {
	private _routes = new Map<string, RouterEntry>();
	// Update when support for new UIModes is added
	private _routePatches = new Map<EUIMode, Map<string, Set<RoutePatch>>>([
		[EUIMode.GamePad, new Map()],
		[EUIMode.Desktop, new Map()],
	]);

	public eventBus = new EventTarget();

	publicState(): PublicCloudeRouterState {
		return { routes: this._routes, routePatches: this._routePatches };
	}

	addRoute(path: string, component: RouterEntry['component'], props: RouterEntry['props'] = {}) {
		this._routes.set(path, { props, component });
		this.notifyUpdate();
	}

	addPatch(path: string, patch: RoutePatch, uiMode: EUIMode) {
		const patchesForMode = this._routePatches.get(uiMode);
		if (!patchesForMode) throw new Error(`UI mode ${uiMode} not supported.`);
		let patchList = patchesForMode.get(path);
		if (!patchList) {
			patchList = new Set();
			patchesForMode.set(path, patchList);
		}
		patchList.add(patch);
		this.notifyUpdate();
		return patch;
	}

	removePatch(path: string, patch: RoutePatch, uiMode: EUIMode) {
		const patchesForMode = this._routePatches.get(uiMode);
		if (!patchesForMode) throw new Error(`UI mode ${uiMode} not supported.`);
		const patchList = patchesForMode.get(path);
		patchList?.delete(patch);
		if (patchList?.size == 0) {
			patchesForMode.delete(path);
		}
		this.notifyUpdate();
	}

	removeRoute(path: string) {
		this._routes.delete(path);
		this.notifyUpdate();
	}

	private notifyUpdate() {
		this.eventBus.dispatchEvent(new Event('update'));
	}
}

interface CloudeRouterStateContext extends PublicCloudeRouterState {
	addRoute(path: string, component: RouterEntry['component'], props: RouterEntry['props']): void;
	addPatch(path: string, patch: RoutePatch, uiMode?: EUIMode): RoutePatch;
	removePatch(path: string, patch: RoutePatch, uiMode?: EUIMode): void;
	removeRoute(path: string): void;
}

const CloudeRouterStateContext = createContext<CloudeRouterStateContext>(null as any);

export const useCloudeRouterState = () => useContext(CloudeRouterStateContext);

interface Props {
	cloudeRouterState: CloudeRouterState;
	children: ReactNode;
}

export const CloudeRouterStateContextProvider: FC<Props> = ({ children, cloudeRouterState: cloudeRouterState }) => {
	const [publicCloudeRouterState, setPublicCloudeRouterState] = useState<PublicCloudeRouterState>({
		...cloudeRouterState.publicState(),
	});

	useEffect(() => {
		function onUpdate() {
			setPublicCloudeRouterState({ ...cloudeRouterState.publicState() });
		}

		cloudeRouterState.eventBus.addEventListener('update', onUpdate);

		return () => cloudeRouterState.eventBus.removeEventListener('update', onUpdate);
	}, []);

	const addRoute = cloudeRouterState.addRoute.bind(cloudeRouterState);
	const addPatch = cloudeRouterState.addPatch.bind(cloudeRouterState);
	const removePatch = cloudeRouterState.removePatch.bind(cloudeRouterState);
	const removeRoute = cloudeRouterState.removeRoute.bind(cloudeRouterState);

	return (
		<CloudeRouterStateContext.Provider value={{ ...publicCloudeRouterState, addRoute, addPatch, removePatch, removeRoute }}>
			{children}
		</CloudeRouterStateContext.Provider>
	);
};
