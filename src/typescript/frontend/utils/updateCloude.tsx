import { IconsModule, pluginSelf, toaster } from '@steambrew/client';
import { backend } from './ffi';
import { deferredSettingLabelClasses } from './classes';

export async function updateCloude(background: boolean) {
	const downloadUrl = pluginSelf.cloudeUpdates?.platformRelease?.browser_download_url;
	const downloadSize = pluginSelf.cloudeUpdates?.platformRelease?.size || 0;

	if (!downloadUrl) {
		toaster.toast({
			title: `Cloude Update Error`,
			body: `No download URL found for update.`,
			logo: <IconsModule.ExclamationPoint className={deferredSettingLabelClasses.Icon} />,
			duration: 5000,
			critical: true,
			sound: 3,
		});
		return;
	}

	backend.updater.updateCloude(downloadUrl, downloadSize, background);
}
