import type MarkdownIt from 'markdown-it';
import type { MarkdownItContentScriptModule } from 'api/types';

import MarkdownItGitHubAlerts from 'markdown-it-github-alerts';

import { ALERT_NO_BACKGROUND_CLASS, addAlertContainerClass } from './alertContainerClass';
import { GITHUB_ALERT_TYPES } from '../codeMirror/alerts/alertParsing';
import { ALERT_ICONS } from '../codeMirror/alerts/alertIcons';
import { SHOW_ALERT_BACKGROUND_SETTING } from '../../settingKeys';

type AssetsItem = { name: string };

type MarkdownItPluginOptions = {
    settingValue?: (key: string) => unknown;
};

const ALERT_OPEN_RULE = 'alert_open';

/**
 * Wraps the alert container renderer so alerts are marked for a transparent background when the
 * background setting is disabled. The setting is read per render, so changes apply on the next
 * viewer render.
 */
function installAlertBackgroundRule(md: MarkdownIt, pluginOptions: MarkdownItPluginOptions | undefined): void {
    const renderAlertOpen = md.renderer.rules[ALERT_OPEN_RULE];
    if (!renderAlertOpen) return;

    md.renderer.rules[ALERT_OPEN_RULE] = (tokens, idx, options, env, self) => {
        const html = renderAlertOpen(tokens, idx, options, env, self);
        const showBackground = pluginOptions?.settingValue?.(SHOW_ALERT_BACKGROUND_SETTING) !== false;
        return showBackground ? html : addAlertContainerClass(html, ALERT_NO_BACKGROUND_CLASS);
    };
}

export default function (): MarkdownItContentScriptModule {
    return {
        plugin: function (md: MarkdownIt, pluginOptions: unknown) {
            md.use(MarkdownItGitHubAlerts, {
                ...((pluginOptions as Record<string, unknown>) ?? {}),
                markers: GITHUB_ALERT_TYPES,
                icons: ALERT_ICONS,
            });
            installAlertBackgroundRule(md, pluginOptions as MarkdownItPluginOptions | undefined);
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
