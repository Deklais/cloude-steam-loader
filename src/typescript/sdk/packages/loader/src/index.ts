declare global {
	interface Window {
		CLOUDE_API: any;
		SP_REACTDOM: any;
		CLOUDE_IPC_PORT: number;
		CLOUDE_FRONTEND_LIB_VERSION: string;
		CLOUDE_BROWSER_LIB_VERSION: string;
		CLOUDE_LOADER_BUILD_DATE: string;
		__cloude_sdk_ready__?: (payload: string) => void;
	}
}

import { Logger } from '@steambrew/client/build/logger';

class Bootstrap {
	logger: Logger;
	cloudeVersionToken: string | undefined = undefined;

	init(versionToken: string) {
		this.cloudeVersionToken = versionToken;

		window.CLOUDE_FRONTEND_LIB_VERSION = process.env.CLOUDE_FRONTEND_LIB_VERSION || 'unknown';
		window.CLOUDE_BROWSER_LIB_VERSION = process.env.CLOUDE_FRONTEND_LIB_VERSION || 'unknown';
		window.CLOUDE_LOADER_BUILD_DATE = process.env.CLOUDE_LOADER_BUILD_DATE || 'unknown';

		this.logger = new Logger('SDK');
		this.logger.log('Loading Cloude Software Development Kit...');
	}

	async loadCloude() {
		const steambrewClientModule = await import('@steambrew/client');
		const cloudeApiModule = await import('./cloude-api');

		/** Set Auth Token */
		Object.assign((window.CLOUDE_API ??= {}), steambrewClientModule, cloudeApiModule);

		/** send some diagnostics about the state of the frontend. it gets forwards to the MEP */
		const apiEntries = Object.entries(window.CLOUDE_API);
		const apiMissing = apiEntries.filter(([key, value]) => key !== 'pluginSelf' && (value === '' || value == null)).map(([key]) => key);

		const params = {
			sdk_version: window.CLOUDE_FRONTEND_LIB_VERSION ?? 'unknown',
			cloude_version: this.cloudeVersionToken,
			api_total: apiEntries.length,
			api_missing: apiMissing,
		};

		/** send the data through the native CDP binding. */
		window.__cloude_sdk_ready__?.(JSON.stringify(params));
	}

	async injectLegacyReactGlobals() {
		if (window.SP_REACT) return; /** we're already setup */

		const webpack = await import('@steambrew/client/build/webpack');

		window.SP_REACT = webpack.findModule((m) => m.Component && m.PureComponent && m.useLayoutEffect);
		window.SP_REACTDOM =
			/** react 18 react dom */
			webpack.findModule((m) => m.createPortal && m.createRoot) /** react 19 react dom */ || {
				...webpack.findModule((m) => m.createPortal && m.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE),
				...webpack.findModule((m) => m.createRoot),
			};

		/* < mar 19 2026 */
		const oldJsx = webpack.findModule((m) => m.jsx && Object.keys(m).length == 1)?.jsx;
		/* >= mar 19 2026*/
		const newJsx = webpack.findModule((m) => m?.jsx && m?.Fragment && m?.jsxs);

		if (oldJsx) {
			window.SP_JSX_FACTORY = {
				Fragment: window.SP_REACT.Fragment,
				jsx: oldJsx,
				jsxs: oldJsx,
			};
		} else if (newJsx) {
			window.SP_JSX_FACTORY = newJsx;
		} else {
			this.logger.error('Failed to find JSX Factory!');
		}
	}

	waitForClientReady(): Promise<void> {
		const checkReady = async (resolve: () => void, interval) => {
			// Steam renamed this readiness method in the 2026-07-24 client update.
			// @ts-expect-error Part of the builtin Steam Client API.
			if (!(window.App?.BFinishedInitBeforeLogin?.() ?? window.App?.BFinishedInitStageOne?.())) return;
			clearInterval(interval);
			await this.injectLegacyReactGlobals();
			resolve();
		};

		return new Promise((resolve) => {
			const interval = setInterval(() => checkReady(resolve, interval), 0);
		});
	}

	private appendScriptTag(src: string): HTMLScriptElement | null {
		if (document.querySelector(`script[src="${src}"][type="module"]`)) return null;
		const script = Object.assign(document.createElement('script'), {
			src,
			type: 'module',
			id: 'cloude-injected',
		});
		document.head.appendChild(script);
		return script;
	}

	async appendShimsToDOM(shimList: string[]) {
		/** Inject the JavaScript shims into the DOM */
		shimList?.forEach((shim) => this.appendScriptTag(shim));
	}

	async importShimsInContext(shimList: string[]) {
		/** Import the JavaScript shims in the current context */
		await Promise.all(shimList?.map((shim) => import(shim)) ?? []);
	}

	async startBrowser(enabledPlugins?: string[], legacyShimList?: string[], ctxShimList?: string[], ftpBasePath?: string) {
		this.init(null);
		const cloudeApiModule = await import('./cloude-api');

		window.CLOUDE_API = cloudeApiModule;

		const browserUtils = await import('./browser-init');
		await browserUtils.appendAccentColor();
		await browserUtils.appendQuickCss();
		await browserUtils.addPluginDOMBreadCrumbs(enabledPlugins);

		/** Inject the JavaScript shims into the DOM */
		await this.appendShimsToDOM(legacyShimList);

		/** Import the JavaScript shims in the current context */
		await this.importShimsInContext(ctxShimList);
	}

	async startClient(version: string, plugins?: string[]) {
		this.init(version);

		await this.waitForClientReady();
		await this.loadCloude();

		if (plugins?.length) this.appendShimsToDOM(plugins);
	}
}

export default Bootstrap;
