/**
 * ==================================================
 *   _____ _ _ _             _
 *  |     |_| | |___ ___ ___|_|_ _ _____
 *  | | | | | | | -_|   |   | | | |     |
 *  |_|_|_|_|_|_|___|_|_|_|_|_|___|_|_|_|
 *
 * ==================================================
 *
 * Copyright (c) 2026 Project Cloude
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import React from 'react';
import { EUIMode, Cloude, pluginSelf, routerHook } from '@steambrew/client';
import { onWindowCreatedCallback, patchMissedDocuments, signalConfigReady } from './patcher';
import { DispatchSystemColors } from './patcher/SystemColors';
import { ParseLocalTheme } from './patcher/ThemeParser';
import { DispatchGlobalColors } from './patcher/v1/GlobalColors';
import { CloudeDesktopSidebar } from './quick-access';
import { DesktopMenuProvider } from './quick-access/DesktopMenuContext';
import { handleSettingsReturnNavigation, CloudeSettings } from './settings';
import { CloudeQuickCssEditor } from './settings/quickcss';
import { PluginCrashInfo, SettingsProps, SystemAccentColor, ThemeItem, ThemeItemV1 } from './types';
import { backend } from './utils/ffi';
import { Logger } from './utils/Logger';
import { installTopRightNotificationMover } from './utils/top-right-notifications';
import { useQuickCssState } from './utils/quick-css-state';
import { useQuickAccessStore } from './quick-access/quickAccessStore';
import { showPluginCrashModal } from './components/PluginCrashModal';

async function initializeCloude(settings: SettingsProps) {
	Logger.Log(`Initialized Cloude Frontend Settings Store:`, settings);

	const theme: ThemeItem = settings.active_theme;
	const systemColors: SystemAccentColor = settings.accent_color;

	ParseLocalTheme(theme);
	DispatchSystemColors(systemColors);

	const themeV1: ThemeItemV1 = settings?.active_theme?.data as ThemeItemV1;

	if (themeV1?.GlobalsColors) {
		DispatchGlobalColors(themeV1?.GlobalsColors);
	}

	if (theme?.data?.hasOwnProperty('RootColors')) {
		try {
			const rootColors = await backend.themes.getRootColors();
			pluginSelf.RootColors = rootColors;
		} catch (error) {
			Logger.Error('Failed to load root colors from backend', error);
		}
	}

	Object.assign(pluginSelf, {
		activeTheme: settings?.active_theme,
		accentColor: settings?.accent_color,
		conditionals: settings?.conditions,
		steamPath: settings?.steamPath,
		installPath: settings?.installPath,
		themesPath: settings?.themesPath,
		version: settings?.cloudeVersion,
		enabledPlugins: settings?.enabledPlugins ?? [],
		buildDate: settings?.buildDate,
		gitCommitOid: settings?.gitCommitOid,
		cloudeUpdates: settings?.cloudeUpdates ?? {},
		platformType: settings?.platformType,
		cloudeLinuxUpdateScript: settings?.cloudeLinuxUpdateScript,
		quickCss: settings?.quickCss ?? '',
	});

	patchMissedDocuments();

	const crashQueue: PluginCrashInfo[] = [];
	let mainWindowReady = false;
	let mainWindowReadyAt = 0;

	const showAfterDelay = (detail: PluginCrashInfo) => {
		const elapsed = Date.now() - mainWindowReadyAt;
		const remaining = Math.max(0, 5000 - elapsed);
		setTimeout(() => showPluginCrashModal(detail), remaining);
	};

	const flushCrashQueue = () => {
		mainWindowReady = true;
		mainWindowReadyAt = Date.now();
		crashQueue.splice(0).forEach(showAfterDelay);
	};

	window.addEventListener('cloude-main-window-ready', flushCrashQueue, { once: true });

	window.addEventListener('cloude-plugin-crash', (e: Event) => {
		const detail = (e as CustomEvent).detail;
		Logger.Log('Received real-time crash event for plugin:', detail?.plugin);
		if (mainWindowReady) showAfterDelay(detail);
		else crashQueue.push(detail);
	});

	if (settings?.pendingCrashes?.length) {
		Logger.Log(`Startup config contains ${settings.pendingCrashes.length} pending crash(es)`);
		settings.pendingCrashes.forEach((d) => crashQueue.push(d));
	}
}

const GlobalCloudeDesktopUI: React.FC = () => {
	return (
		<DesktopMenuProvider>
			<CloudeDesktopSidebar />
		</DesktopMenuProvider>
	);
};

const GlobalCloudeQuickCssEditor: React.FC = () => {
	const { isCloudeOpen } = useQuickCssState();
	if (!isCloudeOpen) {
		return null;
	}

	return <CloudeQuickCssEditor />;
};

// Entry point on the front end of your plugin
export default async function PluginMain() {
	Cloude.AddWindowCreateHook?.(onWindowCreatedCallback);
	routerHook.addRoute('/cloude/settings', CloudeSettings, { exact: false });

	// add global component hooks
	routerHook.addGlobalComponent('CloudeDesktopUI', GlobalCloudeDesktopUI, EUIMode.Desktop);
	routerHook.addGlobalComponent('CloudeQuickCssEditor', GlobalCloudeQuickCssEditor, EUIMode.Desktop);

	Logger.Warn('Cloude Steam Loader: external URL handlers are disabled.');

	try {
		const initService = await backend.config.getInitService();
		await initializeCloude(initService);
		installTopRightNotificationMover();
	} catch (error) {
		Logger.Error('Cloude frontend initialization failed, continuing with route registration.', error);
	} finally {
		signalConfigReady();
	}

	Object.assign(window.CLOUDE_API, {
		openQuickAccess: useQuickAccessStore.getState().openQuickAccess,
	});
	window.dispatchEvent(new CustomEvent('cloude-quick-access-ready'));

	// If the user was in Cloude Settings when a JS context restart happened,
	// navigate back to settings and restore the original start_page.
	handleSettingsReturnNavigation();
}
