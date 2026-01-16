import type { GitHubAlertType } from './alertParsing';

type AlertColorSet = {
    [K in GitHubAlertType]: { color: string; bg: string };
};

export type ThemeColors = {
    light: AlertColorSet;
    dark: AlertColorSet;
};

/**
 * GitHub-style alert colors for light and dark themes.
 *
 * These are the authoritative color values used by both the CodeMirror editor
 * and the MarkdownIt renderer. If updating colors, ensure the corresponding
 * CSS files in contentScripts/markdownIt/ are also updated.
 */
export const ALERT_COLORS: ThemeColors = {
    light: {
        note: { color: '#0969da', bg: 'rgba(9, 105, 218, 0.08)' },
        tip: { color: '#1a7f37', bg: 'rgba(26, 127, 55, 0.08)' },
        important: { color: '#8250df', bg: 'rgba(130, 80, 223, 0.08)' },
        warning: { color: '#9a6700', bg: 'rgba(154, 103, 0, 0.10)' },
        caution: { color: '#d1242f', bg: 'rgba(209, 36, 47, 0.08)' },
    },
    dark: {
        note: { color: '#2f81f7', bg: 'rgba(47, 129, 247, 0.08)' },
        tip: { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.08)' },
        important: { color: '#a371f7', bg: 'rgba(163, 113, 247, 0.08)' },
        warning: { color: '#d29922', bg: 'rgba(210, 153, 34, 0.10)' },
        caution: { color: '#f85149', bg: 'rgba(248, 81, 73, 0.08)' },
    },
} as const;
