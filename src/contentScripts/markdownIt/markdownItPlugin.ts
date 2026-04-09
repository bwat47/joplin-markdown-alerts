import type MarkdownIt from 'markdown-it';

import MarkdownItGitHubAlerts from 'markdown-it-github-alerts';

import { GITHUB_ALERT_TYPES } from '../codeMirror/alerts/alertParsing';
import { ALERT_ICONS } from '../codeMirror/alerts/alertIcons';

type AssetsItem = { name: string };

export default function () {
    return {
        plugin: function (md: MarkdownIt, pluginOptions: unknown) {
            md.use(MarkdownItGitHubAlerts, {
                ...((pluginOptions as Record<string, unknown>) ?? {}),
                markers: GITHUB_ALERT_TYPES,
                icons: ALERT_ICONS,
            });
        },

        assets: function (): AssetsItem[] {
            let rootElement = document.documentElement;
            try {
                const topWindow = window.top;
                if (topWindow?.document?.documentElement) {
                    rootElement = topWindow.document.documentElement;
                }
            } catch {
                // In some Joplin contexts the renderer runs in a file:// frame and cannot access window.top.
                rootElement = document.documentElement;
            }

            const appearance = (() => {
                try {
                    return getComputedStyle(rootElement).getPropertyValue('--joplin-appearance').trim();
                } catch {
                    return '';
                }
            })();

            const themeAsset = appearance === 'dark' ? 'alerts-theme-dark.css' : 'alerts-theme-light.css';

            return [{ name: 'alerts.css' }, { name: themeAsset }];
        },
    };
}
