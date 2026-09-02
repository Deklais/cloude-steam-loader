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

import { ConfirmModal, pluginSelf, showModal } from '@steambrew/client';
import { Utils } from '../../utils';
import { formatString, locale } from '../../utils/localization-manager';
import { UpdateCard } from './UpdateCard';
import { SettingsDialogSubHeader } from '../../components/SteamComponents';
import { updateCloude } from '../../utils/updateCloude';
import { useEffect } from 'react';
import { CloudeUpdates, OSType } from '../../types';
import Markdown from 'markdown-to-jsx';
import { useUpdateContext } from './useUpdateContext';
import { backend } from '../../utils/ffi';
import { registerInstallerProgressListener, unregisterInstallerProgressListener } from '../general/Installer';

export const CloudeUpdateCard = ({ cloudeUpdates }: { cloudeUpdates: CloudeUpdates }) => {
	const ctx = useUpdateContext();

	if (!cloudeUpdates || !cloudeUpdates?.hasUpdate) {
		return null; /** No update for Cloude available */
	}

	useEffect(() => {
		if (pluginSelf.platformType !== OSType.Windows) {
			return; /** no-op outside Windows */
		}

		registerInstallerProgressListener(0, ({ progress, status, isComplete }) => {
			ctx.setCloudeUpdateProgress({ statusText: status, progress, isComplete });
		});

		let interval = setInterval(() => {
			backend.updater.hasPendingCloudeUpdateRestart().then((result) => {
				if (result) {
					pluginSelf.cloudeUpdates.updateInProgress = true;
					ctx.setCloudeUpdating(false);
					clearInterval(interval);
				}
			});
		}, 100);

		return () => {
			unregisterInstallerProgressListener(0);
			clearInterval(interval);
		};
	}, []);

	function StartUpdateWindows() {
		updateCloude(true);
		ctx.setCloudeUpdating(true);
	}

	const GetManualUpdateDescription = () => {
		const tagName = cloudeUpdates?.newVersion?.tag_name ?? '';
		if (pluginSelf.platformType === OSType.Darwin) {
			return formatString(locale.cloudeUpdateMacOS, tagName);
		}

		return formatString(locale.cloudeUpdateLinux, tagName, pluginSelf.cloudeLinuxUpdateScript);
	};

	const StartManualUpdate = () => {
		showModal(
			<ConfirmModal strTitle={locale.strUpdateCloude} strDescription={<Markdown>{GetManualUpdateDescription()}</Markdown>} bAlertDialog={true} />,
			pluginSelf.mainWindow,
			{ bNeverPopOut: false },
		);
	};

	function VersionInformation() {
        return "Cloude@" + cloudeUpdates?.newVersion?.tag_name;
	}

	function StartUpdate() {
		if (pluginSelf.platformType === OSType.Windows) {
			StartUpdateWindows();
		} else if (pluginSelf.platformType === OSType.Linux || pluginSelf.platformType === OSType.Darwin) {
			StartManualUpdate();
		}
	}

	return (
		<>
			<SettingsDialogSubHeader>{locale.strCloude}</SettingsDialogSubHeader>
			<UpdateCard
				update={{
					name: VersionInformation(),
					message: cloudeUpdates?.newVersion?.body ?? '',
					date: Utils.toTimeAgo(cloudeUpdates?.newVersion?.published_at ?? ''),
					commit: cloudeUpdates?.newVersion?.html_url ?? '',
				}}
				index={0}
				totalCount={1}
				isUpdating={ctx.isUpdatingCloude}
				progress={ctx.cloudeUpdateProgress.progress}
				statusText={ctx.cloudeUpdateProgress.statusText}
				onUpdateClick={StartUpdate}
				toolTipText={'Cloude to ' + cloudeUpdates?.newVersion?.tag_name}
				disabled={pluginSelf?.cloudeUpdates?.updateInProgress}
				downloadSize={cloudeUpdates?.platformRelease?.size}
			/>
		</>
	);
};
