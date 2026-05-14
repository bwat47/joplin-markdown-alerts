import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

const LIGHT_SELECTED_COMPLETION_BACKGROUND = '#d4d4d4';
const LIGHT_SELECTED_COMPLETION_COLOR = 'black';

function iconMaskDataUri(type: GitHubAlertType): string {
    const svg = ALERT_ICONS[type].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const autocompleteBaseTheme = EditorView.baseTheme({
    '.cm-tooltip.cm-tooltip-autocomplete .cm-completionIcon': {
        width: '16px',
        height: '16px',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: '6px',
        marginLeft: '2px',
        paddingRight: '0',
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
    const rules: Record<string, Record<string, string>> = {};

    for (const type of GITHUB_ALERT_TYPES) {
        const mask = iconMaskDataUri(type);
        rules[`.cm-tooltip.cm-tooltip-autocomplete .cm-completionIcon-${type}`] = {
            maskImage: mask,
            WebkitMaskImage: mask,
            backgroundColor: colors[type].color,
        };
    }

    if (!isDarkTheme) {
        rules['.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]'] = {
            background: LIGHT_SELECTED_COMPLETION_BACKGROUND,
            color: LIGHT_SELECTED_COMPLETION_COLOR,
        };
    }

    return EditorView.theme(rules);
}

export function createAlertAutocompleteThemeExtension(isDarkTheme: boolean): Extension[] {
    return [autocompleteBaseTheme, buildAutocompleteColorTheme(isDarkTheme)];
}
