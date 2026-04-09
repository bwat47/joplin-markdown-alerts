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
 * If updating colors, ensure the corresponding CSS files in contentScripts/markdownIt/ are also updated.
 */
export const ALERT_COLORS: ThemeColors = {
    light: {
        note: { color: '#0969da', bg: 'rgba(9, 105, 218, 0.08)' },
        tip: { color: '#1a7f37', bg: 'rgba(26, 127, 55, 0.08)' },
        important: { color: '#8250df', bg: 'rgba(130, 80, 223, 0.08)' },
        warning: { color: '#9a6700', bg: 'rgba(154, 103, 0, 0.10)' },
        caution: { color: '#d1242f', bg: 'rgba(209, 36, 47, 0.08)' },
        abstract: { color: '#008FD1', bg: 'rgba(0, 143, 209, 0.08)' },
        info: { color: '#008DA3', bg: 'rgba(0, 141, 163, 0.08)' },
        todo: { color: '#2356AF', bg: 'rgba(35, 86, 175, 0.08)' },
        success: { color: '#00A344', bg: 'rgba(0, 163, 68, 0.08)' },
        question: { color: '#55BD14', bg: 'rgba(85, 189, 20, 0.08)' },
        failure: { color: '#FF2E2E', bg: 'rgba(255, 0, 51, 0.08)' },
        danger: { color: '#D1002A', bg: 'rgba(68, 138, 255, 0.08)' },
        bug: { color: '#D10049', bg: 'rgba(209, 0, 73, 0.08)' },
        example: { color: '#5100FF', bg: 'rgba(81, 0, 255, 0.08)' },
        quote: { color: '#808080', bg: 'rgba(128, 128, 128, 0.08)' },
    },
    dark: {
        note: { color: '#2f81f7', bg: 'rgba(47, 129, 247, 0.08)' },
        tip: { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.08)' },
        important: { color: '#a371f7', bg: 'rgba(163, 113, 247, 0.08)' },
        warning: { color: '#d29922', bg: 'rgba(210, 153, 34, 0.10)' },
        caution: { color: '#f85149', bg: 'rgba(248, 81, 73, 0.08)' },
        abstract: { color: '#00b0ff', bg: 'rgba(0, 176, 255, 0.08)' },
        info: { color: '#00b8d4', bg: 'rgba(83, 211, 230, 0.08)' },
        todo: { color: '#306cd6', bg: 'rgba(48, 108, 214, 0.08)' },
        success: { color: '#00c853', bg: 'rgba(0, 200, 83, 0.08)' },
        question: { color: '#64dd17', bg: 'rgba(100, 221, 23, 0.08)' },
        failure: { color: '#ff5252', bg: 'rgba(255, 82, 82, 0.08)' },
        danger: { color: '#ff1744', bg: 'rgba(68, 138, 255, 0.08)' },
        bug: { color: '#f50057', bg: 'rgba(255, 23, 68, 0.08)' },
        example: { color: '#651fff', bg: 'rgba(101, 31, 255, 0.08)' },
        quote: { color: '#9e9e9e', bg: 'rgba(159, 159, 159, 0.08)' },
    },
};
