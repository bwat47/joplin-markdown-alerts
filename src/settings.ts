import joplin from 'api';
import { SettingItemType } from 'api/types';

import { INLINE_FORMAT_COMMANDS } from './inlineFormatCommands';

const SETTINGS_SECTION = 'markdownAlerts.toolbarButtons';

export const SHOW_ALERT_TOOLBAR_BUTTON_SETTING = 'showAlertToolbarButton';
export const SHOW_QUOTE_TOOLBAR_BUTTON_SETTING = 'showQuoteToolbarButton';

export async function registerPluginSettings(): Promise<void> {
    await joplin.settings.registerSection(SETTINGS_SECTION, {
        label: 'Markdown Alerts and Formatting Commands',
        iconName: 'fas fa-sliders-h',
        description: 'Toolbar button visibility settings. Restart the plugin after changing these values.',
    });

    await joplin.settings.registerSettings({
        [SHOW_ALERT_TOOLBAR_BUTTON_SETTING]: {
            value: true,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show Alert toolbar button',
            description: 'Requires a plugin restart to take effect.',
        },
        [SHOW_QUOTE_TOOLBAR_BUTTON_SETTING]: {
            value: true,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show Blockquote toolbar button',
            description: 'Requires a plugin restart to take effect.',
        },
        ...Object.fromEntries(
            INLINE_FORMAT_COMMANDS.map((format) => [
                format.toolbarButtonSettingKey,
                {
                    value: true,
                    type: SettingItemType.Bool,
                    public: true,
                    section: SETTINGS_SECTION,
                    label: format.toolbarButtonSettingLabel,
                    description: 'Requires a plugin restart to take effect.',
                },
            ])
        ),
    });
}

export async function isToolbarButtonEnabled(settingKey: string): Promise<boolean> {
    return Boolean(await joplin.settings.value(settingKey));
}
