(() => {
	'use strict';

	const PLUGIN = 'TopRight Notifications';
	const STYLE_ID = 'cloude-top-right-notifications-style';
	const PANEL_ID = 'cloude-top-right-notifications-panel';
	const OVERLAY_ID = 'cloude-top-right-notifications-overlay';
	const STORAGE_KEY = 'cloude.topRightNotifications.portalEnabled';
	const DIAGNOSTIC_KEY = 'cloude.topRightNotifications.diagnostics';
	const LOG_KEY = 'cloude.topRightNotifications.domLogs';
	const TOP = '16px';
	const RIGHT = '16px';

	const selectorGroups = {
		containers: [
			'[class*="notificationtoasts_Container"]',
			'[class*="notifications_NotificationsMenu"]',
			'[class*="NotificationsMenu"]',
			'[class*="NotificationToasts"]',
			'[class*="ToastContainer"]',
			'[class*="DesktopToast"]',
			'[class*="BasicUIToast"]',
			'[class*="GamepadUIPopupToast"]',
			'[class*="GamepadUIQAMToast"]',
			'[class*="StandardTemplate"]',
			'[class*="ShortTemplate"]',
			'[class*="toast_"]',
			'[class*="Toast_"]',
			'[class*="Achievement"]',
			'[class*="Download"]',
			'[id*="notification"]',
			'[id*="toast"]',
			'[data-featuretarget*="notification"]',
			'[data-featuretarget*="toast"]',
			'[role="alert"]',
			'[aria-live]'
		],
		toasts: [
			'[class*="notificationtoasts_"]',
			'[class*="notifications_"]',
			'[class*="toast_"]',
			'[class*="Toast_"]',
			'[class*="StandardTemplate"]',
			'[class*="ShortTemplate"]',
			'[class*="Achievement"]',
			'[class*="Friend"]',
			'[class*="Download"]'
		]
	};

	const css = `
		:root[data-cloude-top-right-notifications="enabled"] [class*="notificationtoasts_Container"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="notifications_NotificationsMenu"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="NotificationsMenu"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="NotificationToasts"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="ToastContainer"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="DesktopToast"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="BasicUIToast"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="GamepadUIPopupToast"],
		:root[data-cloude-top-right-notifications="enabled"] [class*="GamepadUIQAMToast"],
		:root[data-cloude-top-right-notifications="enabled"] [id*="notification"],
		:root[data-cloude-top-right-notifications="enabled"] [id*="toast"] {
			position: fixed !important;
			top: ${TOP} !important;
			right: ${RIGHT} !important;
			bottom: auto !important;
			left: auto !important;
			transform-origin: top right !important;
		}

		#${OVERLAY_ID} {
			position: fixed !important;
			top: ${TOP} !important;
			right: ${RIGHT} !important;
			bottom: auto !important;
			left: auto !important;
			z-index: 2147483646 !important;
			display: flex !important;
			flex-direction: column !important;
			align-items: flex-end !important;
			gap: 8px !important;
			width: auto !important;
			height: auto !important;
			pointer-events: none !important;
		}

		#${OVERLAY_ID} > * {
			pointer-events: auto !important;
			position: relative !important;
			top: auto !important;
			right: auto !important;
			bottom: auto !important;
			left: auto !important;
			margin: 0 !important;
			transform-origin: top right !important;
		}

		#${PANEL_ID} {
			position: fixed;
			top: 88px;
			right: 16px;
			z-index: 2147483647;
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 8px;
			background: rgba(31, 20, 48, 0.94);
			border: 1px solid rgba(176, 119, 255, 0.45);
			color: #f4edff;
			font: 12px/1.2 Arial, sans-serif;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
		}

		#${PANEL_ID} button {
			border: 1px solid rgba(196, 153, 255, 0.55);
			background: #39215e;
			color: #fff;
			padding: 6px 8px;
			font: inherit;
			cursor: pointer;
		}

		#${PANEL_ID} button:hover {
			background: #4a2a7d;
		}
	`;

	let observer = null;
	let scanTimer = 0;
	let patchedSetProperty = false;
	let patchedSetAttribute = false;
	const seen = new WeakSet();

	const log = (...args) => console.log(`[${PLUGIN}]`, ...args);
	const warn = (...args) => console.warn(`[${PLUGIN}]`, ...args);

	function diagnosticsEnabled() {
		return localStorage.getItem(DIAGNOSTIC_KEY) !== '0';
	}

	function isEnabled() {
		return localStorage.getItem(STORAGE_KEY) !== '0';
	}

	function setEnabled(enabled) {
		localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
		document.documentElement.dataset.cloudeTopRightNotifications = enabled ? 'enabled' : 'disabled';
		updatePanel();
		if (enabled) scanAndMove('toggle-enabled');
		log(enabled ? 'Enable Top Right Notifications' : 'Disable Top Right Notifications');
	}

	function ensureStyle(doc = document) {
		if (doc.getElementById(STYLE_ID)) return;
		const style = doc.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		doc.documentElement.appendChild(style);
	}

	function ensureOverlay(doc = document) {
		let overlay = doc.getElementById(OVERLAY_ID);
		if (overlay) return overlay;
		overlay = doc.createElement('div');
		overlay.id = OVERLAY_ID;
		doc.documentElement.appendChild(overlay);
		return overlay;
	}

	function getDocuments() {
		const docs = [document];
		for (const frame of Array.from(window.frames)) {
			try {
				if (frame.document && frame.document.documentElement) docs.push(frame.document);
			} catch (_) {}
		}
		return [...new Set(docs)];
	}

	function selectorFor(el) {
		const parts = [];
		let current = el;
		let depth = 0;
		while (current instanceof HTMLElement && depth < 8) {
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

	function rectInfo(el) {
		const rect = el.getBoundingClientRect();
		return {
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
			right: Math.round(rect.right),
			bottom: Math.round(rect.bottom)
		};
	}

	function describeElement(el) {
		const style = getComputedStyle(el);
		const parent = el.parentElement;
		const parentStyle = parent ? getComputedStyle(parent) : null;
		return {
			selector: selectorFor(el),
			tag: el.tagName,
			id: el.id || '',
			className: String(el.className || '').slice(0, 500),
			text: String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500),
			rect: rectInfo(el),
			style: {
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
				pointerEvents: style.pointerEvents
			},
			parent: parent
				? {
						selector: selectorFor(parent),
						className: String(parent.className || '').slice(0, 500),
						rect: rectInfo(parent),
						style: parentStyle
							? {
									position: parentStyle.position,
									display: parentStyle.display,
									zIndex: parentStyle.zIndex,
									top: parentStyle.top,
									right: parentStyle.right,
									bottom: parentStyle.bottom,
									left: parentStyle.left,
									transform: parentStyle.transform
								}
							: null
					}
				: null
		};
	}

	function saveDomLog(entry) {
		try {
			const current = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
			current.push(entry);
			while (current.length > 80) current.shift();
			localStorage.setItem(LOG_KEY, JSON.stringify(current));
		} catch (error) {
			warn('failed to save DOM log', error);
		}
	}

	function captureBottomRight(reason) {
		const entries = [];
		for (const doc of getDocuments()) {
			const view = doc.defaultView || window;
			const all = Array.from(doc.querySelectorAll('body *'));
			for (const node of all) {
				if (!(node instanceof view.HTMLElement)) continue;
				const rect = node.getBoundingClientRect();
				if (rect.width < 40 || rect.height < 20) continue;
				if (rect.right < view.innerWidth * 0.45 || rect.bottom < view.innerHeight * 0.45) continue;
				const style = view.getComputedStyle(node);
				if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
				const text = `${node.id} ${node.className || ''} ${node.textContent || ''}`.toLowerCase();
				if (!/(toast|notification|achievement|friend|invite|download|ready to play|message|chat|trade|steam|aseprite)/.test(text)) continue;
				entries.push(describeElement(node));
			}
		}
		entries.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
		const selected = entries.slice(0, 24);
		const payload = { time: new Date().toISOString(), reason, count: selected.length, entries: selected };
		saveDomLog(payload);
		log('DOM DUMP BOTTOM RIGHT', payload);
		console.table(
			selected.map((entry, index) => ({
				index,
				tag: entry.tag,
				id: entry.id,
				className: entry.className.slice(0, 80),
				text: entry.text.slice(0, 80),
				rect: `${entry.rect.x},${entry.rect.y} ${entry.rect.width}x${entry.rect.height}`,
				position: entry.style.position,
				parent: entry.parent?.className?.slice(0, 80) || ''
			}))
		);
		return payload;
	}

	function elementSummary(el) {
		const classes = typeof el.className === 'string' ? el.className : '';
		return {
			tag: el.tagName,
			id: el.id || '',
			className: classes.slice(0, 240),
			role: el.getAttribute('role') || '',
			ariaLive: el.getAttribute('aria-live') || ''
		};
	}

	function looksLikeToastContainer(el) {
		if (!(el instanceof HTMLElement)) return false;
		if (el.id === PANEL_ID || el.id === OVERLAY_ID || el.closest(`#${PANEL_ID}`)) return false;

		const text = `${el.id} ${el.className || ''} ${el.getAttribute('role') || ''} ${el.getAttribute('aria-live') || ''} ${el.textContent || ''}`.toLowerCase();
		if (/(toast|notification|achievement|friend|invite)/.test(text)) return true;
		if (/(download complete|ready to play|message|chat|trade|wishlist|steam)/.test(text)) return true;

		const style = getComputedStyle(el);
		if (!['fixed', 'absolute'].includes(style.position)) return false;
		const rect = el.getBoundingClientRect();
		const nearRight = rect.right > window.innerWidth * 0.55;
		const nearBottom = rect.bottom > window.innerHeight * 0.55;
		return nearRight && nearBottom && rect.width >= 120 && rect.height >= 40;
	}

	function isBottomRightToastCandidate(el) {
		if (!(el instanceof HTMLElement)) return false;
		if (el.id === PANEL_ID || el.id === OVERLAY_ID || el.closest(`#${PANEL_ID}`)) return false;
		if (el.closest(`#${OVERLAY_ID}`)) return false;
		const rect = el.getBoundingClientRect();
		if (rect.width < 180 || rect.width > 680 || rect.height < 40 || rect.height > 260) return false;
		if (rect.right < window.innerWidth * 0.55 || rect.bottom < window.innerHeight * 0.55) return false;
		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
		if (!['fixed', 'absolute', 'relative'].includes(style.position)) return false;

		const text = `${el.id} ${el.className || ''} ${el.textContent || ''}`.toLowerCase();
		return /(toast|notification|achievement|friend|invite|download complete|ready to play|message|chat|trade|steam)/.test(text);
	}

	function isToastSized(el) {
		const rect = el.getBoundingClientRect();
		return rect.width >= 180 && rect.width <= 680 && rect.height >= 40 && rect.height <= 260;
	}

	function findPortalTarget(el) {
		if (!(el instanceof HTMLElement)) return null;
		if (el.closest(`#${OVERLAY_ID}`)) return null;
		if (isBottomRightToastCandidate(el)) return el;

		const candidates = [];
		el.querySelectorAll?.('*').forEach((child) => {
			if (child instanceof HTMLElement && isBottomRightToastCandidate(child)) candidates.push(child);
		});

		candidates.sort((a, b) => {
			const ar = a.getBoundingClientRect();
			const br = b.getBoundingClientRect();
			return ar.width * ar.height - br.width * br.height;
		});
		return candidates[0] || (looksLikeToastContainer(el) && isToastSized(el) ? el : null);
	}

	function addCandidateAncestors(node, nodes) {
		let current = node;
		let depth = 0;
		while (current instanceof HTMLElement && depth < 5) {
			if (looksLikeToastContainer(current) || isBottomRightToastCandidate(current)) nodes.add(current);
			current = current.parentElement;
			depth += 1;
		}
	}

	function forceTopRight(el, reason) {
		if (!isEnabled() || !(el instanceof HTMLElement)) return;
		const target = findPortalTarget(el);
		if (!target) return;

		const targetDoc = target.ownerDocument || document;
		ensureStyle(targetDoc);
		const overlay = ensureOverlay(targetDoc);
		const rect = target.getBoundingClientRect();
		target.dataset.cloudeTopRightNotificationCandidate = '1';
		target.style.setProperty('width', `${Math.ceil(rect.width)}px`, 'important');
		target.style.setProperty('min-height', `${Math.ceil(rect.height)}px`, 'important');
		target.style.setProperty('position', 'relative', 'important');
		target.style.setProperty('top', 'auto', 'important');
		target.style.setProperty('right', 'auto', 'important');
		target.style.setProperty('bottom', 'auto', 'important');
		target.style.setProperty('left', 'auto', 'important');
		target.style.setProperty('margin', '0', 'important');
		target.style.setProperty('transform-origin', 'top right', 'important');

		if (target.parentElement !== overlay) {
			overlay.appendChild(target);
			log('toast portaled to top-right', reason, elementSummary(target));
		}

		if (!seen.has(target)) {
			seen.add(target);
			log('container found', reason, elementSummary(target));
		} else if (diagnosticsEnabled()) {
			log('position refreshed', reason, elementSummary(target));
		}
	}

	function scanAndMove(reason) {
		try {
			const nodes = new Set();
			for (const doc of getDocuments()) {
				ensureStyle(doc);
				ensureOverlay(doc);
				for (const selector of selectorGroups.containers) {
					doc.querySelectorAll(selector).forEach((node) => nodes.add(node));
				}
				for (const selector of selectorGroups.toasts) {
					doc.querySelectorAll(selector).forEach((node) => {
						nodes.add(node);
						const parent = node.parentElement;
						if (parent) nodes.add(parent);
						addCandidateAncestors(node, nodes);
					});
				}
				doc.querySelectorAll('body *').forEach((node) => {
					if (isBottomRightToastCandidate(node)) addCandidateAncestors(node, nodes);
				});
			}
			nodes.forEach((node) => forceTopRight(node, reason));
			if (diagnosticsEnabled() && nodes.size === 0) warn('no notification containers found', reason);
		} catch (error) {
			warn('scan failed', error);
		}
	}

	function scheduleScan(reason) {
		window.clearTimeout(scanTimer);
		scanTimer = window.setTimeout(() => scanAndMove(reason), 80);
	}

	function patchInlinePositioning() {
		if (patchedSetProperty) return;
		patchedSetProperty = true;

		const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
		CSSStyleDeclaration.prototype.setProperty = function patchedProperty(name, value, priority) {
			const owner = this && this.ownerElement;
			const lower = String(name || '').toLowerCase();
			if (isEnabled() && owner instanceof HTMLElement && looksLikeToastContainer(owner) && (lower === 'bottom' || lower === 'left')) {
				if (diagnosticsEnabled()) log('blocked inline position write', lower, value, elementSummary(owner));
				if (lower === 'bottom') return originalSetProperty.call(this, 'bottom', 'auto', 'important');
				if (lower === 'left') return originalSetProperty.call(this, 'left', 'auto', 'important');
			}
			return originalSetProperty.call(this, name, value, priority);
		};

		if (!patchedSetAttribute) {
			patchedSetAttribute = true;
			const originalSetAttribute = Element.prototype.setAttribute;
			Element.prototype.setAttribute = function patchedAttribute(name, value) {
				const result = originalSetAttribute.call(this, name, value);
				if (isEnabled() && String(name || '').toLowerCase() === 'style' && this instanceof HTMLElement && looksLikeToastContainer(this)) {
					if (diagnosticsEnabled()) log('style attribute write detected', elementSummary(this));
					forceTopRight(this, 'style-attribute');
				}
				return result;
			};
		}
	}

	function inspectSteamRuntimeHints() {
		const hits = [];
		const needles = ['k_EPositionTopRight', 'k_EPositionBottomRight', 'NotificationPosition', 'toast', 'notification', 'MoveTo'];
		for (const key of Object.getOwnPropertyNames(window)) {
			for (const needle of needles) {
				if (key.includes(needle)) hits.push(key);
			}
		}
		if (hits.length) log('runtime symbols found', hits.slice(0, 80));
		else warn('runtime symbols not found; using CSS/DOM positioning');
	}

	function ensurePanel() {
		if (document.getElementById(PANEL_ID)) return;
		const panel = document.createElement('div');
		panel.id = PANEL_ID;

		const toggle = document.createElement('button');
		toggle.type = 'button';
		toggle.addEventListener('click', () => setEnabled(!isEnabled()));

		const diagnostics = document.createElement('button');
		diagnostics.type = 'button';
		diagnostics.addEventListener('click', () => {
			localStorage.setItem(DIAGNOSTIC_KEY, diagnosticsEnabled() ? '0' : '1');
			updatePanel();
			scanAndMove('diagnostics-toggle');
		});

		const dump = document.createElement('button');
		dump.type = 'button';
		dump.addEventListener('click', () => captureBottomRight('button'));

		const copy = document.createElement('button');
		copy.type = 'button';
		copy.addEventListener('click', () => {
			const payload = localStorage.getItem(LOG_KEY) || '[]';
			navigator.clipboard?.writeText(payload).then(
				() => log('DOM logs copied to clipboard'),
				(error) => warn('clipboard copy failed; use localStorage key', LOG_KEY, error)
			);
			log('DOM logs payload', JSON.parse(payload));
		});

		panel.append(toggle, diagnostics, dump, copy);
		document.documentElement.appendChild(panel);
		updatePanel();
	}

	function updatePanel() {
		const panel = document.getElementById(PANEL_ID);
		if (!panel) return;
		const [toggle, diagnostics, dump, copy] = panel.querySelectorAll('button');
		toggle.textContent = isEnabled() ? 'Disable Top Right Notifications' : 'Enable Top Right Notifications';
		diagnostics.textContent = diagnosticsEnabled() ? 'Diagnostics On' : 'Diagnostics Off';
		if (dump) dump.textContent = 'Dump Bottom Right';
		if (copy) copy.textContent = 'Copy Logs';
	}

	function start() {
		ensureStyle();
		ensureOverlay();
		patchInlinePositioning();
		setEnabled(isEnabled());
		ensurePanel();
		inspectSteamRuntimeHints();
		window.CloudeTopRightNotifications = {
			dump: () => captureBottomRight('manual-api'),
			logs: () => JSON.parse(localStorage.getItem(LOG_KEY) || '[]'),
			clear: () => localStorage.removeItem(LOG_KEY),
			scan: () => scanAndMove('manual-api')
		};

		observer = new MutationObserver((mutations) => {
			let shouldCapture = false;
			for (const mutation of mutations) {
				if (mutation.type === 'attributes') {
					forceTopRight(mutation.target, 'attribute-change');
					shouldCapture = true;
				}
				for (const node of mutation.addedNodes) {
					if (node instanceof HTMLElement) {
						forceTopRight(node, 'node-added');
						node.querySelectorAll?.('*').forEach((child) => forceTopRight(child, 'child-added'));
						shouldCapture = true;
					}
				}
			}
			scheduleScan('mutation-batch');
			if (diagnosticsEnabled() && shouldCapture) window.setTimeout(() => captureBottomRight('mutation'), 120);
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'style', 'id', 'role', 'aria-live']
		});

		window.addEventListener('resize', () => scheduleScan('resize'));
		window.setInterval(() => {
			scanAndMove('interval');
			if (diagnosticsEnabled()) captureBottomRight('interval');
		}, 2500);
		scanAndMove('startup');
		captureBottomRight('startup');
		log('local plugin loaded; network APIs are not used');
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start, { once: true });
	} else {
		start();
	}
})();
