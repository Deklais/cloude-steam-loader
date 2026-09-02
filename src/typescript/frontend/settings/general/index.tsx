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

import { ConfirmModal, DialogButton, DialogControlsSection, Dropdown, Field, IconsModule, pluginSelf, showModal, ShowModalResult, TextField, Toggle } from '@steambrew/client';
import React, { useEffect } from 'react';
import { locale } from '../../utils/localization-manager';
import { CloudeUpdateChannel, OnCloudeUpdate, OSType } from '../../types';
import { RenderAccentColorPicker } from '../../components/AccentColorPicker';
import { useCloudeState, useUpdateConfig } from '../../utils/config-provider';
import { DesktopTooltip, SettingsDialogSubHeader } from '../../components/SteamComponents';
import { AppConfig } from '../../utils/AppConfig';
import { deferredSettingLabelClasses, settingsClasses } from '../../utils/classes';
import { refetchCloudeUpdates } from '../updates/useUpdateContext';

export const GeneralViewModal: React.FC = () => {
	const configOrNull = useCloudeState();
	const updateConfig = useUpdateConfig();

	if (!configOrNull) return null;
	const config = configOrNull;

	const handleChange = <K extends keyof AppConfig['general']>(key: K, value: AppConfig['general'][K]) => {
		updateConfig((draft) => {
			draft.general[key] = value;
		});
	};

	const handleNetworkChange = <K extends keyof AppConfig['network']>(key: K, value: AppConfig['network'][K]) => {
		updateConfig((draft) => {
			draft.network[key] = value;
		});
	};

	const showCredentialModal = (title: string, placeholder: string, isPassword: boolean, onConfirm: (value: string) => void) => {
		let modal: ShowModalResult;

		const Modal = () => {
			const [value, setValue] = React.useState('');
			const [modalInstance, setModalInstance] = React.useState<ShowModalResult | null>(null);
			useEffect(() => { setModalInstance(modal); }, []);

			return (
				<ConfirmModal
					strTitle={title}
					strDescription={
						<TextField
							// @ts-ignore
							placeholder={placeholder}
							type={isPassword ? 'password' : 'text'}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					}
					bHideCloseIcon={true}
					strOKButtonText={locale.optionSet}
					onOK={() => { onConfirm(value); modalInstance?.Close(); }}
					onCancel={() => modalInstance?.Close()}
				/>
			);
		};

		modal = showModal(<Modal />, pluginSelf.mainWindow, { bNeverPopOut: true, popupHeight: 250, popupWidth: 500 });
	};

	const OnCloudeUpdateOpts = [
		{ label: locale.eOnCloudeUpdateDoNothing, data: OnCloudeUpdate.DO_NOTHING },
		{ label: locale.eOnCloudeUpdateNotify, data: OnCloudeUpdate.NOTIFY },
	];

	if (pluginSelf?.platformType === OSType.Windows) {
		OnCloudeUpdateOpts.push({ label: locale.eOnCloudeUpdateAutoInstall, data: OnCloudeUpdate.AUTO_INSTALL });
	}

	const cloudeUpdateChannel = [
		{ label: locale.updatePanelStableChannel, data: CloudeUpdateChannel.STABLE },
		{ label: locale.updatePanelBetaChannel, data: CloudeUpdateChannel.BETA },
	];

	return (
		<>
			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.headerOnStartup}</SettingsDialogSubHeader>

				<Field label={locale.optionCheckForCloudeUpdates}>
					<Toggle value={config.general.checkForCloudeUpdates} onChange={(e) => handleChange('checkForCloudeUpdates', e)} />
				</Field>

				<Field label={locale.optionCheckForThemeAndPluginUpdates} bottomSeparator="none">
					<Toggle value={config.general.checkForPluginAndThemeUpdates} onChange={(e) => handleChange('checkForPluginAndThemeUpdates', e)} />
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.headerUpdates}</SettingsDialogSubHeader>

				<Field
					label={locale.optionWhenAnUpdateForCloudeIsAvailable}
					disabled={!config.general.checkForCloudeUpdates}
					icon={
						!config.general.checkForCloudeUpdates && (
							<DesktopTooltip toolTipContent={locale.tooltipCheckForCloudeUpdates} direction="top">
								<IconsModule.ExclamationPoint className={deferredSettingLabelClasses.Icon} />
							</DesktopTooltip>
						)
					}
				>
					<Dropdown
						disabled={!config.general.checkForCloudeUpdates}
						rgOptions={OnCloudeUpdateOpts}
						selectedOption={OnCloudeUpdateOpts.findIndex((opt) => opt.data === config.general.onCloudeUpdate)}
						onChange={(e) => handleChange('onCloudeUpdate', e.data)}
						contextMenuPositionOptions={{ bMatchWidth: false }}
						strDefaultLabel={OnCloudeUpdateOpts.find((opt) => opt.data === config.general.onCloudeUpdate)?.label ?? ''}
					/>
				</Field>

				<Field
					label={locale.updatePanelUpdateChannel}
					description={locale.updatePanelUpdateChannelTooltip}
					bottomSeparator="none"
					icon={
						config.general.cloudeUpdateChannel === CloudeUpdateChannel.BETA && (
							<DesktopTooltip toolTipContent={locale.updatePanelBetaWarning} direction="top">
								<IconsModule.ExclamationPoint className={deferredSettingLabelClasses.Icon} />
							</DesktopTooltip>
						)
					}
				>
					<Dropdown
						rgOptions={cloudeUpdateChannel}
						selectedOption={cloudeUpdateChannel.findIndex((opt) => opt.data === config.general.cloudeUpdateChannel)}
						onChange={(e) => {
							handleChange('cloudeUpdateChannel', e.data);
							refetchCloudeUpdates(e.data);
						}}
						contextMenuPositionOptions={{ bMatchWidth: false }}
						strDefaultLabel={cloudeUpdateChannel.find((opt) => opt.data === config.general.cloudeUpdateChannel)?.label ?? ''}
					/>
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.headerNotifications}</SettingsDialogSubHeader>

				<Field label={locale.optionWhenAPluginOrThemeUpdateIsAvailable} bottomSeparator="none">
					<Toggle value={config.general.shouldShowThemePluginUpdateNotifications} onChange={(e) => handleChange('shouldShowThemePluginUpdateNotifications', e)} />
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.headerThemes}</SettingsDialogSubHeader>

				<Field label={locale.themePanelInjectJavascript}>
					<Toggle value={config.general.injectJavascript} onChange={(e) => handleChange('injectJavascript', e)} />
				</Field>
				<Field label={locale.themePanelInjectCSS}>
					<Toggle value={config.general.injectCSS} onChange={(e) => handleChange('injectCSS', e)} />
				</Field>

				<RenderAccentColorPicker />
			</DialogControlsSection>

			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.headerNetwork}</SettingsDialogSubHeader>

				<Field label={locale.optionProxyUrl} description={locale.optionProxyUrlDescription}>
					<TextField
						// @ts-ignore
						placeholder={locale.optionProxyUrlPlaceholder}
						value={config.network.proxy}
						onChange={(e) => handleNetworkChange('proxy', e.target.value)}
					/>
				</Field>

				<Field label={locale.optionProxyUsername} disabled={!config.network.proxy}>
					{config.network.proxyUsername && (
						<TextField disabled value={config.network.proxyUsername} />
					)}
					<DialogButton
						className={settingsClasses.SettingsDialogButton}
						disabled={!config.network.proxy}
						onClick={() => showCredentialModal(locale.optionProxyUsername, 'Username', false, (v) => handleNetworkChange('proxyUsername', v))}
					>
						{config.network.proxyUsername ? locale.optionChangeUsername : locale.optionSetUsername}
					</DialogButton>
					{config.network.proxyUsername && (
						<DialogButton
							className={settingsClasses.SettingsDialogButton}
							onClick={() => handleNetworkChange('proxyUsername', '')}
						>
							{locale.optionRemove}
						</DialogButton>
					)}
				</Field>

				<Field label={locale.optionProxyPassword} disabled={!config.network.proxy} bottomSeparator="none">
					<DialogButton
						className={settingsClasses.SettingsDialogButton}
						disabled={!config.network.proxy}
						onClick={() => showCredentialModal(locale.optionProxyPassword, 'Password', true, (v) => handleNetworkChange('proxyPassword', v))}
					>
						{config.network.proxyPassword === '__SET__' ? locale.optionChangePassword : locale.optionSetPassword}
					</DialogButton>
					{config.network.proxyPassword === '__SET__' && (
						<DialogButton
							className={settingsClasses.SettingsDialogButton}
							onClick={() => handleNetworkChange('proxyPassword', '')}
						>
							{locale.optionRemove}
						</DialogButton>
					)}
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<SettingsDialogSubHeader>{locale.strAbout}</SettingsDialogSubHeader>

				<Field label={locale.strAboutVersion}>{pluginSelf.version}</Field>
				<Field label={locale.strClientApiVersion}>{window.CLOUDE_FRONTEND_LIB_VERSION}</Field>
				<Field label={locale.strBrowserApiVersion}>{window.CLOUDE_BROWSER_LIB_VERSION}</Field>
				<Field label={locale.strAboutBuildDate}>{new Date(pluginSelf.buildDate ?? '').toLocaleString(navigator.language)}</Field>
				<Field label={locale.strLoaderBuildDate} bottomSeparator="none">
					{new Date(window.CLOUDE_LOADER_BUILD_DATE ?? '').toLocaleString(navigator.language)}
				</Field>
			</DialogControlsSection>
		</>
	);
};
