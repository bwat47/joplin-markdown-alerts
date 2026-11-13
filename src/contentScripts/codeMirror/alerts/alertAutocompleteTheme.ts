import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { ALERT_COMPLETION_TYPE_MARKER } from './alertAutocomplete';
import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

type CssRules = Record<string, Record<string, string>>;

type ColorScheme = 'light' | 'dark';

type SelectionColors = {
    background: string;
    color: string;
};

/**
 * Neutral selected-row colors. The host's default selection background can be a
 * saturated color that hides the colored alert icons, so alert rows use a gray
 * highlight that keeps every icon readable.
 */
const SELECTION_COLORS: Record<ColorScheme, SelectionColors> = {
    light: { background: '#d4d4d4', color: 'black' },
    dark: { background: '#3e4249', color: '#f0f0f0' },
};

const ROW_LAYOUT = {
    lineHeight: '1.2em',
    paddingBlock: '0.3em',
    paddingInline: '0.6em',
    gap: '0.5em',
    /**
     * Fixed pixel size matching the Octicons' 16x16 grid. Font-relative sizes
     * land on fractional pixels and render the icon masks blurry.
     */
    iconSize: '16px',
};

/**
 * Rows visible before the list scrolls. The fractional row hints that more
 * types are available below.
 */
const VISIBLE_ROW_COUNT = 8.5;
/** Rows are as tall as the larger of the icon and the label line, plus padding. */
const ROW_CONTENT_HEIGHT = `max(${ROW_LAYOUT.iconSize}, ${ROW_LAYOUT.lineHeight})`;
const LIST_MAX_HEIGHT = `calc(${VISIBLE_ROW_COUNT} * (${ROW_CONTENT_HEIGHT} + 2 * ${ROW_LAYOUT.paddingBlock}))`;

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
const LAYOUT_RULES: CssRules = {
    [LIST_SELECTOR]: {
        maxHeight: LIST_MAX_HEIGHT,
    },
    [ROW_SELECTOR]: {
        display: 'flex',
        alignItems: 'center',
        gap: ROW_LAYOUT.gap,
        padding: `${ROW_LAYOUT.paddingBlock} ${ROW_LAYOUT.paddingInline}`,
        lineHeight: ROW_LAYOUT.lineHeight,
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
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
    },
};

/**
 * Icon and selected-row colors for one color scheme. Selectors are prefixed with
 * `&light` / `&dark` so CodeMirror applies them based on the editor's dark theme
 * flag.
 */
function buildColorRules(scheme: ColorScheme): CssRules {
    const colors = ALERT_COLORS[scheme];
    const selection = SELECTION_COLORS[scheme];
    const rules: CssRules = {};

    for (const type of GITHUB_ALERT_TYPES) {
        const mask = iconMaskDataUri(type);
        rules[`&${scheme} ${ICON_SELECTOR}.cm-completionIcon-${type}`] = {
            maskImage: mask,
            WebkitMaskImage: mask,
            backgroundColor: colors[type].color,
        };
    }

    rules[`&${scheme} ${SELECTED_ROW_SELECTOR}`] = {
        background: selection.background,
        color: selection.color,
    };

    return rules;
}

export function createAlertAutocompleteThemeExtension(): Extension {
    return EditorView.baseTheme({
        ...LAYOUT_RULES,
        ...buildColorRules('light'),
        ...buildColorRules('dark'),
    });
}
