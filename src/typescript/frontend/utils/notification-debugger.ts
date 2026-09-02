import { pluginSelf, toaster } from '@steambrew/client';
import { backend } from './ffi';

const PANEL_ID = 'cloude-notification-debugger-panel';
const STATUS_ID = 'cloude-notification-debugger-status';
const OUTPUT_ID = 'cloude-notification-debugger-output';
const LOG_KEY = 'cloude.notificationDebugger.logs';
const TEST_NOTIFY_COMMAND = 'cloude_test_notify';

type RectDump = {
	x: number;
	y: number;
	width: number;
	height: number;
	right: number;
	bottom: number;
};

type ElementDump = {
	documentLabel: string;
	selector: string;
	tag: string;
	id: string;
	className: string;
	text: string;
	rect: RectDump;
	style: Record<string, string>;
	parent: {
		selector: string;
		className: string;
		rect: RectDump;
		style: Record<string, string>;
	} | null;
};

type DocumentEntry = {
	document: Document;
	label: string;
};

function rectInfo(el: Element): RectDump {
	const rect = el.getBoundingClientRect();
	return {
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		width: Math.round(rect.width),
		height: Math.round(rect.height),
		right: Math.round(rect.right),
		bottom: Math.round(rect.bottom),
	};
}

function selectorFor(el: Element): string {
	const parts: string[] = [];
	let current: Element | null = el;
	let depth = 0;
	const elementCtor = el.ownerDocument?.defaultView?.HTMLElement ?? HTMLElement;

	while (current instanceof elementCtor && depth < 8) {
		let part = current.tagName.toLowerCase();
		if (current.id) part += `#${current.id}`;
		const classes = typeof current.className === 'string' ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 4) : [];
		for (const cls of classes) part += `.${cls}`;
		parts.unshift(part);
		current = current.parentElement;
		depth += 1;
	}

	return parts.join(' > ');
}

function styleInfo(style: CSSStyleDeclaration): Record<string, string> {
	return {
		position: style.position,
		display: style.display,
		visibility: style.visibility,
		opacity: style.opacity,
		zIndex: style.zIndex,
		top: style.top,
		right: style.right,
		bottom: style.bottom,
		left: style.left,
		transform: style.transform,
		pointerEvents: style.pointerEvents,
	};
}

function describeElement(el: HTMLElement, documentLabel: string): ElementDump {
	const view = el.ownerDocument?.defaultView ?? window;
	const style = view.getComputedStyle(el);
	const parent = el.parentElement;

	return {
		documentLabel,
		selector: selectorFor(el),
		tag: el.tagName,
		id: el.id || '',
		className: String(el.className || '').slice(0, 500),
		text: String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500),
		rect: rectInfo(el),
		style: styleInfo(style),
		parent: parent
			? {
					selector: selectorFor(parent),
					className: String(parent.className || '').slice(0, 500),
					rect: rectInfo(parent),
					style: styleInfo(view.getComputedStyle(parent)),
				}
			: null,
	};
}

function addDocument(entries: DocumentEntry[], doc: Document | undefined | null, label: string) {
	if (!doc?.documentElement || entries.some((entry) => entry.document === doc)) return;
	entries.push({ document: doc, label });

	const view = doc.defaultView;
	if (!view?.frames) return;

	for (let index = 0; index < view.frames.length; index += 1) {
		try {
			addDocument(entries, view.frames[index]?.document, `${label} frame ${index}`);
		} catch {
			// Cross-origin frames are intentionally skipped.
		}
	}
}

function getPopupDocuments(entries: DocumentEntry[]) {
	const popupManager = (window as any).g_PopupManager ?? (globalThis as any).g_PopupManager;
	const popups = popupManager?.GetPopups?.() ?? [];

	for (const popup of popups) {
		const popupWindow = popup?.window ?? popup?.m_popup?.window;
		const name = popup?.m_strName ?? popup?.name ?? 'popup';
		const title = popup?.m_strTitle ?? popup?.title ?? '';
		try {
			addDocument(entries, popupWindow?.document, `${name}${title ? ` / ${title}` : ''}`);
		} catch {
			console.warn('[Cloude Notification Debugger] cannot read popup document', name, title);
		}
	}
}

function getDocuments(): DocumentEntry[] {
	const entries: DocumentEntry[] = [];

	addDocument(entries, document, 'shared context');
	try {
		addDocument(entries, pluginSelf?.mainWindow?.document, 'main Steam window');
	} catch {
		console.warn('[Cloude Notification Debugger] cannot read pluginSelf.mainWindow document');
	}
	getPopupDocuments(entries);

	return entries;
}

function saveLog(payload: unknown) {
	try {
		const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
		logs.push(payload);
		while (logs.length > 80) logs.shift();
		localStorage.setItem(LOG_KEY, JSON.stringify(logs));
	} catch (error) {
		console.warn('[Cloude Notification Debugger] failed to save log', error);
	}
}

function setPanelStatus(message: string) {
	const fullMessage = `${new Date().toLocaleTimeString()} ${message}`;
	for (const { document: doc } of getDocuments()) {
		const status = doc.getElementById(STATUS_ID);
		if (status) status.textContent = fullMessage;
	}
	console.log('[Cloude Notification Debugger]', message);
}

function setPanelOutput(value: string) {
	for (const { document: doc } of getDocuments()) {
		const output = doc.getElementById(OUTPUT_ID) as HTMLTextAreaElement | null;
		if (!output) continue;
		output.value = value;
		output.style.display = 'block';
		output.focus();
		output.select();
	}
}

function jsonFilename(prefix: string) {
	const stamp = new Date().toISOString().replace(/[^0-9A-Za-z._-]/g, '-');
	return `${prefix}-${stamp}.json`;
}

async function saveJsonFile(filename: string, json: string, statusPrefix = 'JSON saved') {
	try {
		const result = await backend.saveNotificationDebugLog(filename, json);
		setPanelStatus(`${statusPrefix}: ${result.path}`);
		return result;
	} catch (error) {
		console.warn('[Cloude Notification Debugger] failed to save JSON log', error);
		setPanelStatus('Failed to save JSON log; see Steam console');
		return null;
	}
}

function findBottomRightCandidates(): ElementDump[] {
	const entries: ElementDump[] = [];

	for (const { document: doc, label } of getDocuments()) {
		const view = doc.defaultView || window;
		const nodes = Array.from(doc.querySelectorAll('body *'));

		for (const node of nodes) {
			if (!(node instanceof view.HTMLElement)) continue;
			if (node.id === PANEL_ID || node.closest(`#${PANEL_ID}`)) continue;

			const rect = node.getBoundingClientRect();
			if (rect.width < 40 || rect.height < 20) continue;
			if (rect.right < view.innerWidth * 0.45 || rect.bottom < view.innerHeight * 0.45) continue;

			const style = view.getComputedStyle(node);
			if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

			const text = `${node.id} ${node.className || ''} ${node.textContent || ''}`.toLowerCase();
			if (!/(toast|notification|achievement|friend|invite|download|ready to play|message|chat|trade|steam|aseprite)/.test(text)) continue;

			entries.push(describeElement(node as HTMLElement, label));
		}
	}

	entries.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
	return entries.slice(0, 30);
}

function dumpBottomRight(reason = 'manual') {
	const entries = findBottomRightCandidates();
	const payload = {
		time: new Date().toISOString(),
		reason,
		count: entries.length,
		entries,
	};

	saveLog(payload);
	setPanelStatus(`Dump complete: ${entries.length} bottom-right candidate(s)`);
	const json = JSON.stringify(payload, null, 2);
	setPanelOutput(json);
	void saveJsonFile('latest.json', json, 'Latest dump saved');
	console.log('[Cloude Notification Debugger] DOM DUMP BOTTOM RIGHT', payload);
	console.table(
		entries.map((entry, index) => ({
			index,
			document: entry.documentLabel,
			tag: entry.tag,
			id: entry.id,
			className: entry.className.slice(0, 80),
			text: entry.text.slice(0, 80),
			rect: `${entry.rect.x},${entry.rect.y} ${entry.rect.width}x${entry.rect.height}`,
			position: entry.style.position,
			parent: entry.parent?.className.slice(0, 80) || '',
		})),
	);

	return payload;
}

function testNotify() {
	setPanelStatus('Test notification requested');
	showLocalFallbackNotification();
	try {
		toaster.toast({
			title: 'Cloude Test Notify',
			body: 'Local test notification from Cloude Steam Loader',
			subtext: 'No network used',
			duration: 7000,
			expiration: 30000,
			showToast: true,
			playSound: false,
		});
		setPanelStatus('Test notification sent through Cloude toaster');
	} catch (error) {
		console.warn('[Cloude Notification Debugger] toaster failed, using local fallback', error);
		setPanelStatus('Toaster failed; local fallback notification shown');
	}

	window.setTimeout(() => dumpBottomRight('test-notify'), 250);
	window.setTimeout(() => dumpBottomRight('test-notify-delayed'), 1000);
}

function showLocalFallbackNotification() {
	for (const { document: doc } of getDocuments()) {
		if (doc.getElementById('cloude-local-test-notification')) continue;

		const node = doc.createElement('div');
		node.id = 'cloude-local-test-notification';
		node.textContent = 'Cloude Test Notify: button works';
		node.style.position = 'fixed';
		node.style.right = '16px';
		node.style.top = '146px';
		node.style.zIndex = '2147483646';
		node.style.padding = '14px 18px';
		node.style.background = '#1f1430';
		node.style.border = '1px solid #b077ff';
		node.style.color = '#fff';
		node.style.font = '14px Arial, sans-serif';
		doc.documentElement.appendChild(node);
		doc.defaultView?.setTimeout(() => node.remove(), 7000);
		return;
	}
}

function saveLogsToJson() {
	const logs = localStorage.getItem(LOG_KEY) || '[]';
	setPanelOutput(logs);
	setPanelStatus(`Saving logs JSON (${logs.length} chars)`);
	void saveJsonFile(jsonFilename('notification-debug'), logs);
	console.log('[Cloude Notification Debugger] logs payload', JSON.parse(logs));
}

function clearLogs() {
	localStorage.removeItem(LOG_KEY);
	setPanelOutput('');
	setPanelStatus('Logs cleared');
}

function exposeApi(targetWindow: Window) {
	(targetWindow as any).CloudeNotificationDebugger = {
		dump: dumpBottomRight,
		testNotify,
		logs: () => JSON.parse(localStorage.getItem(LOG_KEY) || '[]'),
		save: saveLogsToJson,
		copy: saveLogsToJson,
		clear: clearLogs,
	};
}

function isTestNotifyCommand(command: string) {
	const normalized = command.trim().toLowerCase().replace(/\s+/g, ' ');
	return normalized === TEST_NOTIFY_COMMAND || normalized === 'test_notify' || normalized === 'test notify';
}

function installConsoleCommand(targetWindow: Window) {
	const steamConsole = (targetWindow as any).SteamClient?.Console;
	if (!steamConsole || steamConsole.__cloudeTestNotifyPatched) return;

	const originalExecCommand = steamConsole.ExecCommand?.bind(steamConsole);
	if (originalExecCommand) {
		steamConsole.ExecCommand = (command: string) => {
			if (isTestNotifyCommand(String(command || ''))) {
				testNotify();
				return;
			}
			return originalExecCommand(command);
		};
	}

	const originalAutocomplete = steamConsole.GetAutocompleteSuggestions?.bind(steamConsole);
	if (originalAutocomplete) {
		steamConsole.GetAutocompleteSuggestions = async (command: string) => {
			const suggestions = await originalAutocomplete(command);
			const normalized = String(command || '').trim().toLowerCase();
			if (TEST_NOTIFY_COMMAND.startsWith(normalized) && !suggestions.includes(TEST_NOTIFY_COMMAND)) {
				return [TEST_NOTIFY_COMMAND, ...suggestions];
			}
			return suggestions;
		};
	}

	steamConsole.__cloudeTestNotifyPatched = true;
	console.log(`[Cloude Notification Debugger] Steam console command installed: ${TEST_NOTIFY_COMMAND}`);
}

function ensurePanel(doc: Document, label: string) {
	if (doc.getElementById(PANEL_ID)) return;

	const style = doc.createElement('style');
	style.textContent = `
		#${PANEL_ID} {
			position: fixed;
			top: 86px;
			right: 16px;
			z-index: 2147483647;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			max-width: min(720px, calc(100vw - 32px));
			max-height: min(460px, calc(100vh - 110px));
			overflow: auto;
		}
		#${PANEL_ID} .cloude-notification-debugger-row {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		#${PANEL_ID} {
			padding: 8px;
			background: rgba(31, 20, 48, 0.96);
			border: 1px solid rgba(176, 119, 255, 0.55);
			color: #fff;
			font: 12px Arial, sans-serif;
			box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
			pointer-events: auto;
		}
		#${STATUS_ID} {
			max-width: 680px;
			color: #d9c6ff;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		#${OUTPUT_ID} {
			display: none;
			width: min(680px, calc(100vw - 64px));
			height: 220px;
			margin-top: 8px;
			resize: vertical;
			border: 1px solid rgba(196, 153, 255, 0.55);
			background: #120c1d;
			color: #f3ecff;
			padding: 8px;
			font: 11px Consolas, monospace;
		}
		#${PANEL_ID} button {
			border: 1px solid rgba(196, 153, 255, 0.55);
			background: #39215e;
			color: #fff;
			padding: 6px 8px;
			cursor: pointer;
		}
	`;
	doc.documentElement.appendChild(style);

	const panel = doc.createElement('div');
	panel.id = PANEL_ID;
	panel.title = `Cloude Notification Debugger: ${label}`;

	const row = doc.createElement('div');
	row.className = 'cloude-notification-debugger-row';

	const status = doc.createElement('span');
	status.id = STATUS_ID;
	status.textContent = `Ready in ${label}`;

	const output = doc.createElement('textarea');
	output.id = OUTPUT_ID;
	output.readOnly = true;

	const bindButton = (button: HTMLButtonElement, handler: () => void) => {
		button.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				handler();
			},
			true,
		);
	};

	const dump = doc.createElement('button');
	dump.textContent = 'Dump Bottom Right';
	dump.type = 'button';
	bindButton(dump, () => dumpBottomRight('button'));

	const test = doc.createElement('button');
	test.textContent = 'Test Notify';
	test.type = 'button';
	bindButton(test, testNotify);

	const copy = doc.createElement('button');
	copy.textContent = 'Save JSON';
	copy.type = 'button';
	bindButton(copy, saveLogsToJson);

	const clear = doc.createElement('button');
	clear.textContent = 'Clear Logs';
	clear.type = 'button';
	bindButton(clear, clearLogs);

	row.append(dump, test, copy, clear, status);
	panel.append(row, output);
	doc.documentElement.appendChild(panel);

	const targetWindow = doc.defaultView;
	if (targetWindow) {
		exposeApi(targetWindow);
		installConsoleCommand(targetWindow);
	}
	console.log('[Cloude Notification Debugger] panel installed in', label, doc.title);
}

function installIntoKnownDocuments() {
	for (const { document: doc, label } of getDocuments()) {
		try {
			ensurePanel(doc, label);
		} catch (error) {
			console.warn('[Cloude Notification Debugger] failed to install panel', label, error);
		}
	}
}

export function installNotificationDebugger() {
	exposeApi(window);
	installConsoleCommand(window);
	installIntoKnownDocuments();

	window.addEventListener('cloude-main-window-ready', installIntoKnownDocuments);
	window.setInterval(installIntoKnownDocuments, 1500);
	window.setInterval(() => dumpBottomRight('interval'), 5000);
	window.setTimeout(installIntoKnownDocuments, 500);
	window.setTimeout(installIntoKnownDocuments, 2500);
	console.log('[Cloude Notification Debugger] installed');
}
