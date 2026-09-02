# TopRight Notifications report

## Created files

- `plugin.json`
- `.cloude/Dist/index.js`
- `.cloude/Dist/styles.css`
- `.cloude/Dist/plugin.js`

## Steam UI selectors used

The plugin searches for notification/toast containers using local DOM selectors only:

- `[class*="notificationtoasts_Container"]`
- `[class*="notifications_NotificationsMenu"]`
- `[class*="NotificationsMenu"]`
- `[class*="NotificationToasts"]`
- `[class*="ToastContainer"]`
- `[class*="toast_"]`
- `[class*="Toast_"]`
- `[class*="Achievement"]`
- `[class*="Friend"]`
- `[id*="notification"]`
- `[id*="toast"]`
- `[data-featuretarget*="notification"]`
- `[data-featuretarget*="toast"]`
- `[role="alert"]`
- `[aria-live]`

The runtime also logs whether these global symbol names exist on `window`:

- `k_EPositionTopRight`
- `k_EPositionBottomRight`
- `NotificationPosition`
- `toast`
- `notification`
- `MoveTo`

## Method

The primary method is CSS plus runtime DOM enforcement:

- inject local CSS from `.cloude/Dist/styles.css`;
- set `top: 16px`, `right: 16px`, `bottom: auto`, `left: auto`;
- observe DOM mutations and inline style changes;
- refresh candidate containers when Steam adds or moves toast elements;
- keep notification dimensions unchanged.

If Steam writes inline bottom/left positions, the plugin patches `CSSStyleDeclaration.prototype.setProperty` at runtime and blocks only `bottom`/`left` writes for detected toast containers.

## Diagnostics

Diagnostics are enabled by default and log:

- found notification containers;
- position refreshes;
- blocked inline positioning writes;
- failed scans;
- missing runtime symbols.

## Enable/disable

The plugin adds a small local control panel:

- `Enable Top Right Notifications`
- `Disable Top Right Notifications`
- `Diagnostics On`
- `Diagnostics Off`

The setting is stored in `localStorage` under:

- `cloude.topRightNotifications.enabled`
- `cloude.topRightNotifications.diagnostics`

## Limitations

The exact Steam React component names are not stable across Steam UI updates. The plugin therefore uses broad DOM/CSS selectors and diagnostics. If Steam moves notifications into a closed shadow root or canvas-rendered layer, this plugin can only report the failure and cannot move those elements safely.

## Network

The plugin does not use:

- `fetch`
- `XMLHttpRequest`
- `WebSocket`
- `EventSource`
- external libraries
- remote scripts or styles
