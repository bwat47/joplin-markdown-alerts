import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { ALERT_COMPLETION_TYPE_MARKER } from './alertAutocomplete';
import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

type CssRules = Record<string, Record<string, string>>;

type SelectionColors = {
    background: string;
    color: string;
};

/**
 * Neutral selected-row colors. The host's default selection background can be a
 * saturated color that hides the colored alert icons, so alert rows use a gray
 * highlight that keeps every icon readable.
 */
const SELECTION_COLORS: Record<'light' | 'dark', SelectionColors> = {
    light: { background: '#d4d4d4', color: 'black' },
    dark: { background: '#3e4249', color: '#f0f0f0' },
};

const ROW_LAYOUT = {
    lineHeight: 1.2,
    /** Vertical padding in em. */
    paddingBlock: 0.3,
    paddingInline: '0.6em',
    gap: '0.5em',
    iconSize: '1em',
};

/**
 * Rows visible before the list scrolls. The fractional row hints that more
 * types are available below.
 */
const VISIBLE_ROW_COUNT = 8.5;
const LIST_MAX_HEIGHT = `calc(${VISIBLE_ROW_COUNT} * (${ROW_LAYOUT.lineHeight}em + 2 * ${ROW_LAYOUT.paddingBlock}em))`;

const ICON_CLASS = `cm-completionIcon-${ALERT_COMPLETION_TYPE_MARKER}`;
const LIST_SELECTOR = `.cm-tooltip.cm-tooltip-autocomplete > ul:has(.${ICON_CLASS})`;
const ROW_SELECTOR = `.cm-tooltip.cm-tooltip-autocomplete > ul > li:has(.${ICON_CLASS})`;
const SELECTED_ROW_SELECTOR = `.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]:has(.${ICON_CLASS})`;
const ICON_SELECTOR = `.cm-tooltip.cm-tooltip-autocomplete .cm-completionIcon.${ICON_CLASS}`;

function iconMaskDataUri(type: GitHubAlertType): string {
    const svg = ALERT_ICONS[type].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Layout for alert completion rows. Every selector is scoped to rows containing
 * the alert marker icon so completion menus from Joplin or other plugins keep
 * their own styling.
 */
const autocompleteBaseTheme = EditorView.baseTheme({
    [LIST_SELECTOR]: {
        maxHeight: LIST_MAX_HEIGHT,
    },
    [ROW_SELECTOR]: {
        display: 'flex',
        alignItems: 'center',
        gap: ROW_LAYOUT.gap,
        padding: `${ROW_LAYOUT.paddingBlock}em ${ROW_LAYOUT.paddingInline}`,
        lineHeight: String(ROW_LAYOUT.lineHeight),
    },
    // Resets label padding that other plugins may apply to every completion menu.
    [`${ROW_SELECTOR} > .cm-completionLabel`]: {
        padding: '0',
    },
    [ICON_SELECTOR]: {
        // Explicit so stylesheets that hide completion icons in every menu
        // (e.g. Quick Links Plus) don't hide the alert icons.
        display: 'inline-block',
        width: ROW_LAYOUT.iconSize,
        height: ROW_LAYOUT.iconSize,
        padding: '0',
        boxSizing: 'border-box',
        opacity: '1',
        flexShrink: '0',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
    },
});

function buildAutocompleteColorTheme(isDarkTheme: boolean): Extension {
    const colors = isDarkTheme ? ALERT_COLORS.dark : ALERT_COLORS.light;
    const selection = isDarkTheme ? SELECTION_COLORS.dark : SELECTION_COLORS.light;
    const rules: CssRules = {};

    for (const type of GITHUB_ALERT_TYPES) {
        const mask = iconMaskDataUri(type);
        rules[`${ICON_SELECTOR}.cm-completionIcon-${type}`] = {
            maskImage: mask,
            WebkitMaskImage: mask,
            backgroundColor: colors[type].color,
        };
    }

    rules[SELECTED_ROW_SELECTOR] = {
        background: selection.background,
        color: selection.color,
    };

    return EditorView.theme(rules);
}

export function createAlertAutocompleteThemeExtension(isDarkTheme: boolean): Extension[] {
    return [autocompleteBaseTheme, buildAutocompleteColorTheme(isDarkTheme)];
}
