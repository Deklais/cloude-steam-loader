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

import { useEffect, useState } from 'react';
import { Classes, DialogBody, DialogButton, DialogControlsSection, Field, IconsModule, Navigation, SidebarNavigation, SidebarNavigationPage } from '@steambrew/client';
import { settingsClasses } from '../utils/classes';
import { PluginViewModal } from './plugins';
import { RenderLogViewer } from './logs';
import { ConfigProvider } from '../utils/config-provider';
import Styles from '../utils/styles';
import { useQuickAccessStore } from '../quick-access/quickAccessStore';
import { CloudeIcons } from '../components/Icons';
import { FaFolderOpen, FaPowerOff, FaRedo } from 'react-icons/fa';
import { PiPlugsFill } from 'react-icons/pi';
import { Utils } from '../utils';
import { backend } from '../utils/ffi';
import { PluginComponent } from '../types';

declare global {
	const g_PopupManager: any;
}

const SETTINGS_TAB_KEY = 'cloude-settings-tab';
const SETTINGS_RETURN_KEY = 'cloude-return-to-settings';
const SETTINGS_ORIGINAL_START_PAGE_KEY = 'cloude-original-start-page';
const APP_NAME = 'Cloude Steam Loader';

/**
 * Restore the user's start_page after a JS context restart brought them back to settings.
 * Called from PluginMain on startup.
 */
export function handleSettingsReturnNavigation(): boolean {
	const shouldReturn = sessionStorage.getItem(SETTINGS_RETURN_KEY);
	if (!shouldReturn) return false;

	sessionStorage.removeItem(SETTINGS_RETURN_KEY);

	const originalStartPage = sessionStorage.getItem(SETTINGS_ORIGINAL_START_PAGE_KEY);
	if (originalStartPage !== null) {
		try {
			(window as any).settingsStore.m_ClientSettings.start_page = originalStartPage;
		} catch {}
		sessionStorage.removeItem(SETTINGS_ORIGINAL_START_PAGE_KEY);
	}

	const savedTab = sessionStorage.getItem(SETTINGS_TAB_KEY);
	Navigation.Navigate(savedTab || '/cloude/settings');
	return true;
}

export function CloudeSettings() {
	const className = `${settingsClasses.SettingsModal} ${settingsClasses.DesktopPopup} CloudeSettings ModalDialogPopup`;

	const statusStyle = {
		background: 'linear-gradient(135deg, #181020 0%, #2b1642 100%)',
		border: '1px solid rgba(177, 124, 255, 0.35)',
		borderRadius: 6,
		padding: 16,
		marginBottom: 14,
		color: '#f3eefe',
	};

	const LocalActions = () => {
		const openPluginsFolder = async () => {
			const path = await backend.environment.get('CLOUDE__PLUGINS_PATH');
			Utils.BrowseLocalFolder(path);
		};

		const disableAll = async () => {
			const plugins: PluginComponent[] = await backend.plugins.getPlugins();
			const payload = plugins.filter((plugin) => plugin.data.name !== 'core').map((plugin) => ({ plugin_name: plugin.data.name, enabled: false }));
			await backend.plugins.togglePlugin(JSON.stringify(payload));
			SteamClient.Browser.RestartJSContext();
		};

		return (
			<>
				<div style={statusStyle}>
					<div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{APP_NAME}</div>
					<div>Steam detected / Loader active / Network disabled</div>
				</div>
				<DialogControlsSection className="CloudeButtonsSection">
					<DialogButton className={`CloudeButton ${settingsClasses.SettingsDialogButton}`} onClick={() => SteamClient.Browser.RestartJSContext()}>
						<FaRedo />
						Reload Plugins
					</DialogButton>
					<DialogButton className={`CloudeButton ${settingsClasses.SettingsDialogButton}`} onClick={openPluginsFolder}>
						<FaFolderOpen />
						Open Plugins Folder
					</DialogButton>
					<DialogButton className={`CloudeButton ${settingsClasses.SettingsDialogButton}`} onClick={disableAll}>
						<FaPowerOff />
						Disable All
					</DialogButton>
				</DialogControlsSection>
			</>
		);
	};

	const LocalSettings = () => {
		const [pluginsPath, setPluginsPath] = useState('');
		useEffect(() => {
			backend.environment.get('CLOUDE__PLUGINS_PATH').then(setPluginsPath).catch(() => setPluginsPath('Unavailable'));
		}, []);

		return (
			<>
				<div style={statusStyle}>
					<div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{APP_NAME}</div>
					<div>Steam detected / Loader active / Network disabled</div>
				</div>
				<DialogControlsSection>
					<Field label="Network">Disabled, blocked in backend and plugin HTTP APIs</Field>
					<Field label="Plugin source">Local folder only</Field>
					<Field label="Plugins folder" bottomSeparator="none">{pluginsPath}</Field>
				</DialogControlsSection>
			</>
		);
	};

	const tabSpotPlugins: SidebarNavigationPage = {
		visible: true,
		title: 'Local Plugins',
		icon: <PiPlugsFill style={{ height: '20px', width: '20px' }} />,
		content: (
			<DialogBody className={Classes.SettingsDialogBodyFade}>
				<LocalActions />
				<PluginViewModal />
			</DialogBody>
		),
		route: '/cloude/settings/plugins',
	};

	const tabSpotLogs: SidebarNavigationPage = {
		visible: true,
		title: 'Logs',
		icon: <IconsModule.TextCodeBlock />,
		content: (
			<DialogBody className={Classes.SettingsDialogBodyFade}>
				<RenderLogViewer />
			</DialogBody>
		),
		route: '/cloude/settings/logs',
	};

	const tabSpotSettings: SidebarNavigationPage = {
		visible: true,
		title: 'Settings',
		icon: <CloudeIcons.SteamBrewLogo />,
		content: (
			<DialogBody className={Classes.SettingsDialogBodyFade}>
				<LocalSettings />
			</DialogBody>
		),
		route: '/cloude/settings',
	};

	const settingsPages: (SidebarNavigationPage | 'separator')[] = [
		tabSpotPlugins,
		tabSpotLogs,
		tabSpotSettings,
	];
	const [currentPage, setCurrentPage] = useState<string | undefined>(undefined);

	useEffect(() => {
		// Flag that we're in settings — survives RestartJSContext since cleanup won't run.
		sessionStorage.setItem(SETTINGS_RETURN_KEY, 'true');

		// Temporarily swap start_page to "library" so restarts load faster.
		try {
			const store = (window as any).settingsStore?.m_ClientSettings;
			if (store && !sessionStorage.getItem(SETTINGS_ORIGINAL_START_PAGE_KEY)) {
				sessionStorage.setItem(SETTINGS_ORIGINAL_START_PAGE_KEY, String(store.start_page));
				store.start_page = 'library';
			}
		} catch {}

		return () => {
			// Normal navigation away — clear flag and restore start_page.
			sessionStorage.removeItem(SETTINGS_RETURN_KEY);

			const saved = sessionStorage.getItem(SETTINGS_ORIGINAL_START_PAGE_KEY);
			if (saved !== null) {
				try {
					(window as any).settingsStore.m_ClientSettings.start_page = saved;
				} catch {}
				sessionStorage.removeItem(SETTINGS_ORIGINAL_START_PAGE_KEY);
			}
		};
	}, []);

	return (
		<ConfigProvider>
			<Styles />
			<SidebarNavigation
				className={className}
				pages={settingsPages}
				title={APP_NAME}
				{...(currentPage ? { page: currentPage } : {})}
				onPageRequested={(page: string) => {
					setCurrentPage(page);
					sessionStorage.setItem(SETTINGS_TAB_KEY, page);
				}}
			/>
		</ConfigProvider>
	);
}

function RenderSettingsModal(_: any, retObj: any) {
	const items = [
		{
			name: APP_NAME,
			onClick: () => {
				Navigation.Navigate('/cloude/settings');
			},
			visible: true,
		},
		{
			name: `${APP_NAME} Quick Access`,
			onClick: () => {
				useQuickAccessStore.getState().openQuickAccess();
			},
			visible: true,
		},
		'separator',
	];

	retObj?.props?.menuItems?.splice?.(retObj?.props?.menuItems?.length - 1, 0, ...items);
	return retObj?.type?.(retObj.props);
}

export { RenderSettingsModal };
