import type MarkdownIt from 'markdown-it';

import MarkdownItGitHubAlerts from 'markdown-it-github-alerts';

type AssetsItem = { name: string };

export default function () {
    return {
        plugin: function (md: MarkdownIt, pluginOptions: unknown) {
            md.use(MarkdownItGitHubAlerts, (pluginOptions ?? {}) as Record<string, unknown>);
        },

        assets: function (): AssetsItem[] {
            let rootElement = document.documentElement;
            let appearance = '';
            try {
                const topWindow = window.top;
                if (topWindow?.document?.documentElement) {
                    rootElement = topWindow.document.documentElement;
                }
            } catch {
                // In some Joplin contexts the renderer runs in a file:// frame and cannot access window.top.
                rootElement = document.documentElement;
            }

            try {
                appearance = getComputedStyle(rootElement).getPropertyValue('--joplin-appearance').trim();
            } catch {
                appearance = '';
            }

            const themeAsset =
                appearance === 'dark' ? 'ghAlerts-theme-dark.css' : 'ghAlerts-theme-light.css';

            return [{ name: 'ghAlerts.css' }, { name: themeAsset }];
        },
    };
}
