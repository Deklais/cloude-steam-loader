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

import { fieldClasses, pagedSettingsClasses } from './classes';

const styles = /* css */ `
:root {
	/* Stolen from Steam store */
	--CloudeText-Font: "Motiva Sans", Arial, Sans-serif;
	--CloudeText-HeadingLarge: normal 700 26px/1.4 var(--CloudeText-Font);
	--CloudeText-HeadingMedium: normal 700 22px/1.4 var(--CloudeText-Font);
	--CloudeText-HeadingSmall: normal 700 18px/1.4 var(--CloudeText-Font);
	--CloudeText-BodyLarge: normal 400 16px/1.4 var(--CloudeText-Font);
	--CloudeText-BodyMedium: normal 400 14px/1.4 var(--CloudeText-Font);
	--CloudeText-BodySmall: normal 400 12px/1.4 var(--CloudeText-Font);

	--CloudeTextColor-Normal: #fff;
	/* Matches body and .ModalPosition */
	--CloudeTextColor-Muted: #969696;
	/* Base for these: #59bf40, stolen from Steam Guard icon in Settings -> Security */
	--CloudeTextColor-Success: #59bf40;
	--CloudeTextColor-Error: #bf4040;
	--CloudeTextColor-Warning: #bfbd40;

	--CloudeSpacing-Small: 5px;
	--CloudeSpacing-Normal: 10px;
	--CloudeSpacing-Large: 20px;

	/* Match Steam's .DialogButton border-radius */
	--CloudeControls-BorderRadius: 2px;
	--CloudeControls-IconSize: 16px;
}

.CloudeButtonsSection {
    display: flex;
    flex-wrap: wrap;
    gap: var(--CloudeSpacing-Normal);
    margin-top: var(--CloudeSpacing-Normal);

	.DialogButton {
		width: unset;
		flex-grow: 1;
	}
}

.CloudeLogsSection .DialogButton {
	width: -webkit-fill-available;
}

.CloudeButton {
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
	gap: var(--CloudeSpacing-Normal) !important;

	svg {
		width: var(--CloudeControls-IconSize);
		height: var(--CloudeControls-IconSize);
	}
}

/* Inherits .CloudeButton */
.CloudeIconButton {
	--size: 32px;
	padding: 0 !important;
	width: var(--size) !important;
	height: var(--size) !important;

	&[data-icon-name^="Karat"] {
		--CloudeControls-IconSize: 24px;
	}
}

html body .CloudeButton.CloudeIconButton.CloudeIconButtonWithText {
   	padding: 0 14px !important;
	width: auto !important;
}

.CloudeColorPicker {
	--size: 34px;
	background: transparent;
	border: none;
	padding: 0;
	/* Align with DialogButton */
	margin-block: 2px;
	flex-shrink: 0;
	width: var(--size);
	height: var(--size);

	&::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	&::-webkit-color-swatch {
		border: none;
		border-radius: var(--CloudeControls-BorderRadius);
	}
}

/**
 * Placeholder
 */
.CloudePlaceholder_Container {
	gap: var(--CloudeSpacing-Normal);
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
}

.CloudePlaceholder_Icon {
	width: 64px;
}

.CloudePlaceholder_Header {
	color: var(--CloudeTextColor-Normal);
	font: var(--CloudeText-HeadingMedium);
}

.CloudePlaceholder_Text {
	color: var(--CloudeTextColor-Muted);
	font: var(--CloudeText-BodyLarge);
}

.CloudePlaceholder_Buttons {
	gap: var(--CloudeSpacing-Normal);
	display: flex;
}

/* Override Steam styles */
.CloudeSettings {
	/* <SidebarNavigation> is not supposed to be in the main window, so add a
	 * border to distinguish it from the nav bar. */
	border-top: 1px solid rgba(61, 68, 80, .65);
	min-height: 100% !important;

	.DialogContent_InnerWidth {
		max-width: unset !important;
	}

	.DialogContentTransition {
		max-width: unset !important;
	}

	/* Fix the dropdown not filling the proper width when specific theme names are too long. */
	.DialogDropDown {
		min-width: max-content !important;
	}

	textarea.DialogInput {
		width: 100% !important;
	}

	.PageListColumn {
		min-height: unset !important;
	}

	.${fieldClasses.FieldChildrenInner} {
		gap: var(--CloudeSpacing-Normal);
		align-items: center;
	}

	.${pagedSettingsClasses.PageListItem_Title} {
		overflow: visible !important;
		flex-grow: 1;
	}

	.sideBarUpdatesItem {
		display: flex;
		gap: var(--CloudeSpacing-Normal);
		justify-content: space-between;
		align-items: center;
		overflow: visible !important;
	}

	.FriendMessageCount {
		display: flex !important;
		margin-top: 0px !important;
		position: initial !important;

		line-height: 20px;
		height: fit-content !important;
		width: fit-content !important;
	}
}

/**
 * Logs
 */
.CloudeLogs_LogItemButton {
	&:not([data-warning-count="0"]) svg {
		color: var(--CloudeTextColor-Warning);
	}

	&:not([data-error-count="0"]) svg {
		color: var(--CloudeTextColor-Error);
	}

	/* Nothing to display */
	&[data-warning-count="0"][data-error-count="0"] > .tool-tip-source {
		display: none;
	}

	& > .tool-tip-source {
		display: flex;
	}
}

.CloudeLogs_HeaderTextTypeContainer {
	display: flex;
    flex-direction: column;
    justify-content: center;
}

.CloudeLogs_HeaderTextTypeCount {
	color: var(--CloudeTextColor-Muted);
	font: var(--CloudeText-BodySmall);

	&[data-type="error"]:not([data-count="0"]) {
		color: var(--CloudeTextColor-Error);
	}

	&[data-type="warning"]:not([data-count="0"]) {
		color: var(--CloudeTextColor-Warning);
	}
}

.CloudeLogs_TextContainer {
	gap: var(--CloudeSpacing-Large);
	margin-top: var(--CloudeSpacing-Small);
	display: flex;
	flex-direction: column;
	height: -webkit-fill-available;
}

.CloudeLogs_TextControls {
	gap: var(--CloudeSpacing-Normal);
	display: flex;
	justify-content: space-between;
}

.CloudeLogs_ControlSection {
	gap: var(--CloudeSpacing-Normal);
	display: flex;
	justify-content: space-between;
}

.CloudeLogs_NavContainer {
    display: flex;
    gap: var(--CloudeSpacing-Normal);
}

.CloudeLogs_Icons {
	gap: var(--CloudeSpacing-Normal);
	display: flex;
}

.CloudeLogs_Text {
	color: white !important;
	line-height: inherit;
	padding: var(--CloudeSpacing-Normal);
	margin: 0;
	overflow-y: auto;
	white-space: pre-wrap;
	height: 100%;
	user-select: text;
	font-family: Consolas, "Courier New", monospace;
}

/**
 * Plugins
 */
.CloudePlugins_PluginLabel,
.CloudeThemes_ThemeLabel {
	gap: var(--CloudeSpacing-Normal);
	display: flex;
	align-items: center;
}

.CloudeItem_Version,
.CloudePlugins_Metrics {
	display: flex;
	gap: var(--CloudeSpacing-Small);
}

@keyframes CloudeMetrics_Flash {
	from {
		color: #fff;
		background: rgba(255, 255, 255, 0.18);
	}
	to {
		color: var(--CloudeTextColor-Muted);
		background: rgba(255, 255, 255, 0.05);
	}
}

.CloudeItem_Version span,
.CloudePlugins_Metrics span {
	color: var(--CloudeTextColor-Muted);
	font: var(--CloudeText-BodySmall);
	background: rgba(255, 255, 255, 0.05);
	border-radius: 4px;
	padding: 1px 6px;
	display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
}

.CloudePlugins_Metrics span {
	animation: CloudeMetrics_Flash 0.6s ease-out;
}

.CloudeItem_BrowserExtension {
	height: 20px;
	padding: 0 8px;
	border-radius: 6px;
	background-color: var(--CloudeTextColor-Muted);
	border: 1px solid #5c5c5c;
	box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
}

/**
 * Themes
 */
.CloudeThemes_AccentColorField[data-default-color="true"] {
	.DialogButton {
		display: none;
	}
}

.CloudeThemes_Author {
	gap: var(--CloudeSpacing-Small);
	display: flex;
}

/**
 * Updates
 */

.CloudeUpdates_CheckForUpdates {
    display: flex !important;
    justify-content: center;
    align-items: center;
    gap: 10px;
}

.CloudeUpdates_Description {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.5s ease;
}

.CloudeUpdates_Field[data-expanded="false"] {
	.CloudeUpdates_Description {
		height: 0 !important;
	}
}

.CloudeUpdates_Field[data-expanded="true"] {
	.CloudeUpdates_ExpandButton > svg {
		transform: rotate(180deg);
	}
}

.CloudeUpdates_ProgressBar {
	/* <Field> override */
	align-self: baseline;

	&:not([role="progressbar"]) {
		padding: 0 !important;
		/* icon button size + .DialogButton margin-block * 2 */
		height: calc(32px + 2px * 2) !important;

		&::after {
			content: unset !important;
		}
	}
}

/**
 * Dialogs
 */
.CloudeInstallerDialog {
	width: 450px;
}

.CloudeInstallerDialog_ProgressBar div {
	transition: all 0.5s ease 0s !important;
}

.CloudeInstallerDialog_ProgressBar {
	&::after {
		content: unset !important;
	}

	* {
		width: 100%;
		text-align: right;
	}
}

/**
 * Other
 */
.CloudePluginSettingsGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--CloudeSpacing-Large);
    padding: 2ex 5ex 2ex 5ex;
}

._1aw7cA3mAZfWt8idAlVJWi:has(.SliderControlPanelGroup) {
	width: -webkit-fill-available;
}

.CloudePluginSettingsSliderValue,
.CloudeThemeSliderValue {
    position: absolute;
    right: 0;
    top: 5px;
    font-size: 14px;
}

.CloudePlaceholder_Button {
	min-width: fit-content;
    display: flex !important;
    gap: var(--CloudeSpacing-Normal);
    justify-content: center;
    align-items: center;
}

.CloudeQuickCss_CodeEditor {
	& > .cm-editor {
		height: 100%;
	}
}
`;

export const CloudeDesktopSidebarStyles = ({ openAnimStart, isDesktopMenuOpen }: { openAnimStart: boolean; isDesktopMenuOpen: boolean; isViewingPlugin: boolean }) => {
	const styles = `
    .title-area {
      	z-index: 999999 !important;
    }

    .CloudeDesktopSidebar {
		--sidebar-bg: #171d25;
		--sidebar-content-spacing-inline: 16px;
		--sidebar-width: 350px;

		overflow: hidden;
		position: absolute;
		height: 100%;
		width: var(--sidebar-width);
		top: 0px;
		right: 0px;
		z-index: 999;
		transition: transform 0.4s cubic-bezier(0.65, 0, 0.35, 1);
		transform: ${openAnimStart ? 'translateX(0px)' : 'translateX(var(--sidebar-width))'};
		display: ${isDesktopMenuOpen ? 'flex' : 'none'};
		flex-direction: column;
		background: var(--sidebar-bg);
    }

	.CloudeDesktopSidebar_Content {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: auto;

		.CloudeDesktopSidebar:not([data-focused-item-type]) & {
			padding-block-start: 24px;
		}
	}

	.CloudeDesktopSidebar_Editor {
		display: contents;
	}

	.CloudeDesktopSidebar_EditorContent {
		display: flex;
		padding: 0px 20px 20px 20px;
		flex-direction: column;
		height: 100%;
		overflow: auto;

		.CloudeDesktopSidebar[data-focused-item-type="PLUGIN"] & {
			padding-block-start: 24px;
		}

		& > .DialogBody {
			padding-top: 0px;
        	-webkit-mask-image: unset !important;
		}
	}

	.CloudeDesktopSidebar_EditorHeader {
		box-shadow: 0 0 7px 12px var(--sidebar-bg);
		padding: var(--sidebar-content-spacing-inline);
		margin-top: 12px;
	}

	.CloudeDesktopSidebar_LibraryItemButton {
		padding: 0 var(--CloudeSpacing-Normal) !important;
		margin-block: 0 var(--CloudeSpacing-Small) !important;
		justify-content: start !important;
		box-sizing: border-box !important;
	}

    .CloudeDesktopSidebar_Overlay {
		position: absolute;
		inset: 0;
		z-index: 998;
		/* Match .ModalOverlayBackground */
		background: rgba(0, 0, 0, 0.8);
		opacity: ${openAnimStart ? 1 : 0};
		display: ${isDesktopMenuOpen ? 'flex' : 'none'};
		transition: opacity 0.4s cubic-bezier(0.65, 0, 0.35, 1);
    }

	.CloudeDesktopSidebar_Title {
		/* Use the top bar's height, since -webkit-app-region is for some reason
		 * unreliable (but set it anyway) here when it touches the top bar, not
		 * letting us press the button but drag the window instead. */
		padding-block-start: 65px;
		padding-inline: var(--sidebar-content-spacing-inline);
		position: sticky;
		top: 0;
		justify-content: start;
		-webkit-app-region: no-drag;

		.CloudeDesktopSidebar[data-focused-item-type] & {
			flex-direction: row-reverse;
		}
	}

	.CloudeDesktopSidebar_TitleButtons {
		.CloudeDesktopSidebar:not([data-focused-item-type]) & {
			margin-inline-start: auto;
		}
	}
    `;

	return <style>{styles}</style>;
};

const Styles = () => <style>{styles}</style>;

export default Styles;
