import joplin from 'api';
import { SettingItemType } from 'api/types';

import {
    INLINE_FORMAT_COMMANDS,
    INLINE_FORMAT_HTML_SYNTAX,
    INLINE_FORMAT_MARKDOWN_SYNTAX,
    type InlineFormatSyntaxMode,
} from './inlineFormatCommands';

const SETTINGS_SECTION = 'markdownAlerts.toolbarButtons';

export const SHOW_ALERT_TOOLBAR_BUTTON_SETTING = 'showAlertToolbarButton';
export const SHOW_QUOTE_TOOLBAR_BUTTON_SETTING = 'showQuoteToolbarButton';
export const SUPERSCRIPT_SYNTAX_SETTING = 'superscriptSyntax';
export const SUBSCRIPT_SYNTAX_SETTING = 'subscriptSyntax';

const SUPERSCRIPT_SYNTAX_OPTIONS: Record<InlineFormatSyntaxMode, string> = {
    html: 'Inline HTML (<sup>text</sup>)',
    markdown: 'Markdown extension (^text^)',
};

const SUBSCRIPT_SYNTAX_OPTIONS: Record<InlineFormatSyntaxMode, string> = {
    html: 'Inline HTML (<sub>text</sub>)',
    markdown: 'Markdown extension (~text~)',
};

export async function registerPluginSettings(): Promise<void> {
    await joplin.settings.registerSection(SETTINGS_SECTION, {
        label: 'Markdown Alerts and Formatting Commands',
        iconName: 'fas fa-sliders-h',
        description:
            'Toolbar button visibility settings and superscript/subscript syntax settings. ' +
            'Toolbar visibility changes require a plugin restart; syntax changes apply to commands immediately.',
    });

    await joplin.settings.registerSettings({
        [SUPERSCRIPT_SYNTAX_SETTING]: {
            value: INLINE_FORMAT_HTML_SYNTAX,
            type: SettingItemType.String,
            isEnum: true,
            options: SUPERSCRIPT_SYNTAX_OPTIONS,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Superscript syntax',
            description: 'Controls whether the superscript command uses inline HTML or markdown extension syntax.',
        },
        [SUBSCRIPT_SYNTAX_SETTING]: {
            value: INLINE_FORMAT_HTML_SYNTAX,
            type: SettingItemType.String,
            isEnum: true,
            options: SUBSCRIPT_SYNTAX_OPTIONS,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Subscript syntax',
            description: 'Controls whether the subscript command uses inline HTML or markdown extension syntax.',
        },
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

async function getInlineFormatSyntaxSettingValue(settingKey: string): Promise<InlineFormatSyntaxMode> {
    const value = await joplin.settings.value(settingKey);
    return value === INLINE_FORMAT_MARKDOWN_SYNTAX ? INLINE_FORMAT_MARKDOWN_SYNTAX : INLINE_FORMAT_HTML_SYNTAX;
}

export async function getSuperscriptSyntaxSettingValue(): Promise<InlineFormatSyntaxMode> {
    return getInlineFormatSyntaxSettingValue(SUPERSCRIPT_SYNTAX_SETTING);
}

export async function getSubscriptSyntaxSettingValue(): Promise<InlineFormatSyntaxMode> {
    return getInlineFormatSyntaxSettingValue(SUBSCRIPT_SYNTAX_SETTING);
}
