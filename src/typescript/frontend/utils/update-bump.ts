import { Logger } from './Logger';

export async function IncrementThemeDownloadFromId(id: string) {
	Logger.Warn('Network disabled: blocked theme download counter bump:', id);
}

export async function IncrementPluginDownloadFromId(id: string) {
	Logger.Warn('Network disabled: blocked plugin download counter bump:', id);
}
