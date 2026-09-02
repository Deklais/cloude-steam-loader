import { FunctionComponent, useEffect, useReducer, useState } from 'react';
import { getLikelyErrorSourceFromValveReactError, ValveReactErrorInfo } from '../hooks/error-from-source';

interface CloudeErrorBoundaryProps {
	error: ValveReactErrorInfo;
	errorKey: string;
	identifier: string;
	reset: () => void;
}

declare global {
	interface Window {
		SystemNetworkStore?: any;
	}
}

interface CloudeUpdates {
	hasUpdate: boolean;
	updateInProgress: boolean;
	newVersion: { tag_name: string } | null;
	platformRelease: { browser_download_url: string; size: number } | null;
}

// 0 = Windows, 1 = Linux, 2 = Darwin
const enum OSType {
	Windows = 0,
	Linux = 1,
	Darwin = 2,
}

interface StartConfig {
	cloudeUpdates?: CloudeUpdates;
	platformType: OSType;
	cloudeLinuxUpdateScript?: string;
}

// The stub `ffi` from cloude-api is baked into the loader bundle and always resolves to undefined.
// window.CLOUDE_API.ffi is the real implementation (pluginName, route) injected at runtime by the loader.
// The Cloude internal frontend uses plugin name 'core' for all Core_* FFI calls.
function coreFFI<TArgs extends any[], TReturn>(route: string): (...args: TArgs) => Promise<TReturn> {
	return (...args: TArgs): Promise<TReturn> => {
		const realFfi = (window as any).CLOUDE_API?.ffi;
		if (typeof realFfi !== 'function') return Promise.resolve(undefined as any);
		return realFfi('core', route)(...args);
	};
}

const getStartConfig = coreFFI<[], StartConfig>('Core_GetStartConfig');
const checkCloudeUpdate = coreFFI<[channel: string], CloudeUpdates>('Core_CheckCloudeUpdate');
const setPluginStatus = coreFFI<[pluginJson: string], void>('Core_ChangePluginStatus');
const doUpdateCloude = coreFFI<[downloadUrl: string, downloadSize: number, background: boolean], void>('Core_UpdateCloude');

type UpdateChannel = 'stable' | 'beta';
type CheckState = 'idle' | 'checking' | 'found' | 'up-to-date' | 'error';

const CloudeErrorBoundary: FunctionComponent<CloudeErrorBoundaryProps> = ({ error, identifier, reset }) => {
	const [actionLog, addLogLine] = useReducer((log: string, line: string) => log + '\n' + line, '');
	const [startConfig, setStartConfig] = useState<StartConfig | null>(null);
	const [channel, setChannel] = useState<UpdateChannel>('stable');
	const [checkState, setCheckState] = useState<CheckState>('idle');
	const [errorSource, wasCausedByPlugin, shouldReportToValve] = getLikelyErrorSourceFromValveReactError(error);

	useEffect(() => {
		if (!shouldReportToValve) window.__ERRORBOUNDARY_HOOK_INSTANCE.temporarilyDisableReporting();
		getStartConfig().then(setStartConfig);
	}, []);

	const restartSteam = () => {
		addLogLine('Restarting Steam...');
		SteamClient.User.StartRestart(false);
	};

	const disablePlugin = async () => {
		addLogLine(`Disabling ${errorSource}...`);
		await setPluginStatus(JSON.stringify([{ plugin_name: errorSource, enabled: false }]));
	};

	const onCheckForUpdates = async () => {
		setCheckState('checking');
		try {
			const updates = await checkCloudeUpdate(channel);
			setStartConfig((prev) => (prev ? { ...prev, cloudeUpdates: updates } : prev));
			setCheckState(updates?.hasUpdate ? 'found' : 'up-to-date');
		} catch {
			setCheckState('error');
		}
	};

	const onUpdateCloude = async () => {
		const url = startConfig?.cloudeUpdates?.platformRelease?.browser_download_url;
		const size = startConfig?.cloudeUpdates?.platformRelease?.size ?? 0;
		if (!url) return;
		addLogLine('Starting Cloude update...');
		await doUpdateCloude(url, size, false);
		restartSteam();
	};

	const update = startConfig?.cloudeUpdates;
	const isWindows = startConfig?.platformType === OSType.Windows;
	const isLinuxOrMac = startConfig?.platformType === OSType.Linux || startConfig?.platformType === OSType.Darwin;

	const btn = { marginRight: '5px', padding: '5px' };
	const sel = { height: '28px', marginRight: '5px', padding: '0 4px', verticalAlign: 'middle' };

	return (
		<>
			<style>{`*:has(> .CloudeErrorBoundary) { overflow: scroll !important; }`}</style>
			<div
				style={{ overflow: 'auto', marginLeft: '15px', color: 'white', fontSize: '16px', userSelect: 'auto', backgroundColor: 'black', marginTop: '48px' }}
				className="CloudeErrorBoundary"
			>
				<h1 style={{ fontSize: '20px', display: 'inline-block', userSelect: 'auto' }}>⚠️ An error occurred while rendering this content.</h1>

				{identifier && (
					<pre>
						<code>Error Reference: {identifier}</code>
					</pre>
				)}

				<p>
					This error likely occurred in <strong>{errorSource}</strong>.
				</p>

				{actionLog.length > 0 && (
					<pre>
						<code>Running actions...{actionLog}</code>
					</pre>
				)}

				<h3>Actions:</h3>
				<div style={{ display: 'block', marginBottom: '5px' }}>
					<button style={btn} onClick={reset}>
						Retry
					</button>
					<button style={btn} onClick={restartSteam}>
						Restart Steam
					</button>
				</div>

				{wasCausedByPlugin && (
					<div style={{ display: 'block', marginBottom: '5px' }}>
						<button style={btn} onClick={disablePlugin}>
							Disable {errorSource}
						</button>
					</div>
				)}

				<h3>Cloude Updates:</h3>
				<div style={{ display: 'block', marginBottom: '5px' }}>
					<select
						style={sel}
						value={channel}
						onChange={(e) => {
							setChannel(e.target.value as UpdateChannel);
							setCheckState('idle');
						}}
					>
						<option value="stable">Stable</option>
						<option value="beta">Beta</option>
					</select>
					<button style={btn} onClick={onCheckForUpdates} disabled={checkState === 'checking'}>
						{checkState === 'checking' ? 'Checking...' : 'Check for updates'}
					</button>
					{checkState === 'up-to-date' && <span style={{ marginLeft: '6px', opacity: 0.7 }}>Cloude is up to date.</span>}
					{checkState === 'error' && <span style={{ marginLeft: '6px', color: '#f88' }}>Update check failed.</span>}
				</div>

				{(checkState === 'found' || update?.hasUpdate) && (
					<div style={{ display: 'block', marginBottom: '5px' }}>
						<p style={{ margin: '0 0 4px' }}>Cloude {update?.newVersion?.tag_name} is available — updating may resolve this error.</p>
						{isWindows && (
							<button style={btn} onClick={onUpdateCloude}>
								Update Cloude and restart Steam
							</button>
						)}
						{isLinuxOrMac && startConfig?.cloudeLinuxUpdateScript && (
							<pre style={{ userSelect: 'auto', margin: '4px 0' }}>
								<code>{startConfig.cloudeLinuxUpdateScript}</code>
							</pre>
						)}
					</div>
				)}

				<pre style={{ marginTop: '15px', opacity: 0.7, userSelect: 'auto' }}>
					<code>
						{error.error.stack}
						{'\n\nComponent Stack:'}
						{error.info.componentStack}
					</code>
				</pre>
			</div>
		</>
	);
};

export default CloudeErrorBoundary;
