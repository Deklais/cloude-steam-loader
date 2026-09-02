import { ErrorInfo } from 'react';

const pluginErrorRegex = /cloude\.ftp\/.+\/plugins\/([^/]+)\/.cloude\/Dist\/index\.js/;
const cloudeFrontendRegex = /cloude\.ftp\/[a-zA-Z0-9]{32}\/cloude-frontend\.js/;
const cloudeApiRegex = /cloude\.ftp\/[a-zA-Z0-9]{32}\/cloude\.js/;

export interface ValveReactErrorInfo {
	error: Error;
	info: ErrorInfo;
}

export interface ValveError {
	identifier: string;
	identifierHash: string;
	message: string | [func: string, src: string, line: number, column: number];
}

export type ErrorSource = [source: string, wasPlugin: boolean, shouldReportToValve: boolean];

export function getLikelyErrorSourceFromValveError(error: ValveError): ErrorSource {
	return getLikelyErrorSource(JSON.stringify(error?.message));
}

export function getLikelyErrorSourceFromValveReactError(error: ValveReactErrorInfo): ErrorSource {
	return getLikelyErrorSource(error?.error?.stack + '\n' + error.info.componentStack);
}

export function getLikelyErrorSource(error?: string): ErrorSource {

	const pluginMatch = error?.match(pluginErrorRegex);
	if (pluginMatch) {
		return [decodeURIComponent(pluginMatch[1]), true, false];
	}

	if (error && cloudeFrontendRegex.test(error)) {
		return ['the Cloude frontend', false, false];
	}

	if (error && cloudeApiRegex.test(error)) {
		return ['the Cloude API', false, false];
	}

	return ['Steam', false, true];
}
