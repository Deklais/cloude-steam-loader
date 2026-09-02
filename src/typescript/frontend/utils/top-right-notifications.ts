import { pluginSelf, Router } from '@steambrew/client';

const PLUGIN_NAME = 'top-right-notifications';
const OFFSET = 16;
const STYLE_ID = 'cloude-top-right-notification-window-style';
const TOP_RIGHT_POSITION = {
	position: 1,
	horizontalInset: OFFSET,
	verticalInset: OFFSET,
};

type PopupLike = {
	m_strName?: string;
	m_strTitle?: string;
	name?: string;
	title?: string;
	window?: Window;
	browserView?: BrowserViewLike;
	m_browser?: BrowserViewLike;
	m_BrowserView?: BrowserViewLike;
	m_popup?: {
		window?: Window;
		browserView?: BrowserViewLike;
		m_browser?: BrowserViewLike;
		m_BrowserView?: BrowserViewLike;
	};
};

type BrowserViewLike = {
	SetBounds?: (x: number, y: number, width: number, height: number) => void;
	SetVisible?: (visible: boolean) => void;
	GetBounds?: () => { x: number; y: number; width: number; height: number };
	__cloudeTopRightBoundsPatched?: boolean;
};

type ToastWindow = Window;

function isPluginEnabled() {
	return pluginSelf?.enabledPlugins?.includes(PLUGIN_NAME);
}

function getPopupWindow(popup: PopupLike) {
	return popup?.window ?? popup?.m_popup?.window ?? null;
}

function getPopupLabel(popup: PopupLike) {
	return `${popup?.m_strName ?? popup?.name ?? ''} ${popup?.m_strTitle ?? popup?.title ?? ''}`.trim();
}

function isNotificationToastPopup(popup: PopupLike) {
	return getPopupLabel(popup).toLowerCase().includes('notificationtoasts');
}

function forceTopRightNotificationPosition(target: any, reason: string) {
	if (!target || typeof target !== 'object') return false;

	let changed = false;
	try {
		if ('m_notificationPosition' in target) {
			target.m_notificationPosition = { ...TOP_RIGHT_POSITION };
			changed = true;
		}

		if ('NotificationPosition' in target) {
			const descriptor = Object.getOwnPropertyDescriptor(target, 'NotificationPosition') ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'NotificationPosition');
			if (!descriptor || descriptor.set || descriptor.writable) {
				target.NotificationPosition = { ...TOP_RIGHT_POSITION };
				changed = true;
			}
		}
	} catch (error) {
		console.warn('[TopRight Notifications] failed to set notification position', reason, error);
	}

	return changed;
}

function patchNotificationPositionStores(reason: string) {
	if (!isPluginEnabled()) return;

	const candidates: any[] = [];
	try {
		candidates.push((window as any).SteamUIStore?.GetFocusedWindowInstance?.());
	} catch {}

	try {
		candidates.push(Router?.WindowStore?.GamepadUIMainWindowInstance);
		candidates.push(...(Router?.WindowStore?.SteamUIWindows ?? []));
		candidates.push(...(Router?.WindowStore?.OverlayWindows ?? []));
	} catch {}

	try {
		const mainWindow = pluginSelf?.mainWindow as any;
		candidates.push(mainWindow?.SteamUIStore?.GetFocusedWindowInstance?.());
	} catch {}

	for (const candidate of candidates.filter(Boolean)) {
		forceTopRightNotificationPosition(candidate, reason);
		forceTopRightNotificationPosition(candidate?.WindowStore, reason);
		forceTopRightNotificationPosition(candidate?.BrowserWindow, reason);
	}
}

function getBrowserView(popup: PopupLike): BrowserViewLike | null {
	const candidates = [
		popup?.browserView,
		popup?.m_browser,
		popup?.m_BrowserView,
		popup?.m_popup?.browserView,
		popup?.m_popup?.m_browser,
		popup?.m_popup?.m_BrowserView,
		(popup as any)?.m_popup?.browser_view,
		(popup as any)?.m_popup?.m_browserView,
		(popup as any)?.m_popup,
		popup,
	];

	return candidates.find((candidate) => typeof candidate?.SetBounds === 'function') ?? null;
}

function patchPopupBounds(popup: PopupLike) {
	if (!isPluginEnabled() || !isNotificationToastPopup(popup)) return;

	const browserView = getBrowserView(popup);
	if (!browserView?.SetBounds || browserView.__cloudeTopRightBoundsPatched) return;

	const originalSetBounds = browserView.SetBounds.bind(browserView);
	browserView.SetBounds = (x: number, _y: number, width: number, height: number) => {
		const popupWindow = getPopupWindow(popup) as any;
		const popupScreen = popupWindow?.screen as any;
		const currentScreen = window.screen as any;
		const monitorWidth = Number(popupScreen?.availWidth || currentScreen?.availWidth || 0);
		const monitorLeft = Number(popupScreen?.availLeft || currentScreen?.availLeft || 0);
		const monitorTop = Number(popupScreen?.availTop || currentScreen?.availTop || 0);

		if (monitorWidth > 0) {
			const nextX = monitorLeft + monitorWidth - width - OFFSET;
			const nextY = monitorTop + OFFSET;
			return originalSetBounds(Math.round(nextX), Math.round(nextY), width, height);
		}

		return originalSetBounds(x, OFFSET, width, height);
	};

	if (browserView.SetVisible) {
		const originalSetVisible = browserView.SetVisible.bind(browserView);
		browserView.SetVisible = (visible: boolean) => {
			try {
				const bounds = browserView.GetBounds?.();
				if (bounds) browserView.SetBounds?.(bounds.x, bounds.y, bounds.width, bounds.height);
			} catch {
				// Some Steam BrowserView objects throw before first layout; MoveTo fallback still handles it.
			}
			return originalSetVisible(visible);
		};
	}

	browserView.__cloudeTopRightBoundsPatched = true;
}

function injectToastWindowCss(popupWindow: Window) {
	const doc = popupWindow.document;
	if (!doc?.documentElement || doc.getElementById(STYLE_ID)) return;

	doc.documentElement.classList.add('cloude-top-right-toast-window');
	doc.body?.classList.add('cloude-top-right-toast-window');

	const style = doc.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		html.cloude-top-right-toast-window,
		body.cloude-top-right-toast-window {
			overflow: hidden !important;
			transform-origin: top right !important;
		}

		html.cloude-top-right-toast-window *,
		body.cloude-top-right-toast-window * {
			transform-origin: top right !important;
		}

		html.cloude-top-right-toast-window [class*="GamepadUIQAMToast"],
		html.cloude-top-right-toast-window [class*="GamepadUIPopupToast"],
		html.cloude-top-right-toast-window [class*="StandardTemplate"],
		html.cloude-top-right-toast-window [class*="ShortTemplate"],
		html.cloude-top-right-toast-window [class*="Panel"] {
			margin-top: 0 !important;
			margin-bottom: 0 !important;
		}
	`;
	doc.documentElement.appendChild(style);
}

async function movePopupToTopRight(popup: PopupLike, reason: string) {
	if (!isPluginEnabled() || !isNotificationToastPopup(popup)) return;

	patchNotificationPositionStores(`before-${reason}`);
	patchPopupBounds(popup);

	const popupWindow = getPopupWindow(popup) as ToastWindow | null;
	if (!popupWindow) return;

	const steamWindow = (popupWindow as any)?.SteamClient?.Window;
	if (!steamWindow) return;

	try {
		injectToastWindowCss(popupWindow);
	} catch (error) {
		console.warn('[TopRight Notifications] failed to inject toast CSS', getPopupLabel(popup), reason, error);
	}
}

function getPopups(): PopupLike[] {
	const popupManager = (window as any).g_PopupManager ?? (globalThis as any).g_PopupManager;
	try {
		return Array.from(popupManager?.GetPopups?.() ?? []);
	} catch {
		return [];
	}
}

function moveExistingToastPopups(reason: string) {
	if (!isPluginEnabled()) return;
	patchNotificationPositionStores(reason);
	for (const popup of getPopups()) {
		patchPopupBounds(popup);
		void movePopupToTopRight(popup, reason);
	}
}

export function installTopRightNotificationMover() {
	if ((window as any).__cloudeTopRightNotificationMoverInstalled) return;
	(window as any).__cloudeTopRightNotificationMoverInstalled = true;

	const popupManager = (window as any).g_PopupManager ?? (globalThis as any).g_PopupManager;
	popupManager?.AddPopupCreatedCallback?.((popup: PopupLike) => {
		if (!isNotificationToastPopup(popup)) return;
		patchNotificationPositionStores('popup-created-sync');
		patchPopupBounds(popup);
		window.setTimeout(() => void movePopupToTopRight(popup, 'popup-created'), 0);
		window.setTimeout(() => void movePopupToTopRight(popup, 'popup-created-delayed'), 250);
		window.setTimeout(() => void movePopupToTopRight(popup, 'popup-created-late'), 1000);
	});

	window.setInterval(() => moveExistingToastPopups('interval'), 1000);
	window.setInterval(() => patchNotificationPositionStores('store-interval'), 500);
	patchNotificationPositionStores('startup-sync');
	window.setTimeout(() => moveExistingToastPopups('startup'), 500);
	console.log('[TopRight Notifications] popup mover installed');
}
