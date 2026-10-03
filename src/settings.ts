import joplin from 'api';
import { SettingItemType } from 'api/types';

import {
    INLINE_FORMAT_COMMANDS,
    INLINE_FORMAT_HTML_SYNTAX,
    INLINE_FORMAT_MARKDOWN_SYNTAX,
    type InlineFormatSyntaxMode,
} from './inlineFormatCommands';
import type { MarkdownAlertEditorSettings } from './contentScripts/codeMirror/pluginSettings';
import { SHOW_ALERT_BACKGROUND_SETTING } from './settingKeys';

const SETTINGS_SECTION = 'markdownAlerts.toolbarButtons';

export const SHOW_ALERT_TOOLBAR_BUTTON_SETTING = 'showAlertToolbarButton';
export const SHOW_QUOTE_TOOLBAR_BUTTON_SETTING = 'showQuoteToolbarButton';
export const SHOW_CLEAR_FORMATTING_TOOLBAR_BUTTON_SETTING = 'showClearFormattingToolbarButton';
const SUPERSCRIPT_SYNTAX_SETTING = 'superscriptSyntax';
const SUBSCRIPT_SYNTAX_SETTING = 'subscriptSyntax';
const ENABLE_ALERT_AUTOCOMPLETE_SETTING = 'enableAlertAutocomplete';
const RENDER_ALERT_TITLES_SETTING = 'renderAlertTitles';

const TOOLBAR_BUTTON_DEFAULT_ENABLED = true;
const ENABLE_ALERT_AUTOCOMPLETE_DEFAULT = true;
const RENDER_ALERT_TITLES_DEFAULT = true;
const SHOW_ALERT_BACKGROUND_DEFAULT = true;

export type ToolbarButtonSettings = Record<string, boolean>;

const TOOLBAR_BUTTON_SETTING_KEYS: string[] = [
    SHOW_ALERT_TOOLBAR_BUTTON_SETTING,
    SHOW_QUOTE_TOOLBAR_BUTTON_SETTING,
    SHOW_CLEAR_FORMATTING_TOOLBAR_BUTTON_SETTING,
    ...INLINE_FORMAT_COMMANDS.map((format) => format.toolbarButtonSettingKey),
];

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
        [RENDER_ALERT_TITLES_SETTING]: {
            value: RENDER_ALERT_TITLES_DEFAULT,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Render alert titles in editor',
            description:
                'Replace the [!TYPE] marker on alert title lines with an icon and title. When disabled, the raw title line is shown in the alert color. Requires reopening the note to take effect.',
        },
        [SHOW_ALERT_BACKGROUND_SETTING]: {
            value: SHOW_ALERT_BACKGROUND_DEFAULT,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show alert background color',
            description:
                'Fill alerts with a tinted background in the editor and viewer. Editor changes require reopening the note; the viewer updates on its next render (e.g. after editing or switching notes).',
        },
        [ENABLE_ALERT_AUTOCOMPLETE_SETTING]: {
            value: ENABLE_ALERT_AUTOCOMPLETE_DEFAULT,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Enable alert type autocomplete in editor',
            description:
                'When typing >! or > [! at the start of a line, show a dropdown of alert types. Requires reopening the note to take effect.',
        },
        [SHOW_ALERT_TOOLBAR_BUTTON_SETTING]: {
            value: TOOLBAR_BUTTON_DEFAULT_ENABLED,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show Alert toolbar button',
            description: 'Requires a plugin restart to take effect.',
        },
        [SHOW_QUOTE_TOOLBAR_BUTTON_SETTING]: {
            value: TOOLBAR_BUTTON_DEFAULT_ENABLED,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show Blockquote toolbar button',
            description: 'Requires a plugin restart to take effect.',
        },
        [SHOW_CLEAR_FORMATTING_TOOLBAR_BUTTON_SETTING]: {
            value: TOOLBAR_BUTTON_DEFAULT_ENABLED,
            type: SettingItemType.Bool,
            public: true,
            section: SETTINGS_SECTION,
            label: 'Show Clear Formatting toolbar button',
            description: 'Requires a plugin restart to take effect.',
        },
        ...Object.fromEntries(
            INLINE_FORMAT_COMMANDS.map((format) => [
                format.toolbarButtonSettingKey,
                {
                    value: TOOLBAR_BUTTON_DEFAULT_ENABLED,
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

/**
 * Reads every toolbar button visibility setting in one call. Joplin recommends `values()` over
 * repeated `value()` calls when a plugin reads its settings at startup.
 *
 * Keys missing from the response fall back to the registered default so a button is never
 * silently hidden.
 */
export async function getToolbarButtonSettings(): Promise<ToolbarButtonSettings> {
    const values = await joplin.settings.values(TOOLBAR_BUTTON_SETTING_KEYS);

    return Object.fromEntries(
        TOOLBAR_BUTTON_SETTING_KEYS.map((key) => [key, Boolean(values[key] ?? TOOLBAR_BUTTON_DEFAULT_ENABLED)])
    );
}

/**
 * Reads the settings consumed by the CodeMirror content script. Missing keys fall back to their
 * registered defaults.
 */
export async function getMarkdownAlertEditorSettingValues(): Promise<MarkdownAlertEditorSettings> {
    const values = await joplin.settings.values([
        ENABLE_ALERT_AUTOCOMPLETE_SETTING,
        RENDER_ALERT_TITLES_SETTING,
        SHOW_ALERT_BACKGROUND_SETTING,
    ]);

    return {
        enableAlertAutocomplete: Boolean(
            values[ENABLE_ALERT_AUTOCOMPLETE_SETTING] ?? ENABLE_ALERT_AUTOCOMPLETE_DEFAULT
        ),
        renderAlertTitles: Boolean(values[RENDER_ALERT_TITLES_SETTING] ?? RENDER_ALERT_TITLES_DEFAULT),
        showAlertBackground: Boolean(values[SHOW_ALERT_BACKGROUND_SETTING] ?? SHOW_ALERT_BACKGROUND_DEFAULT),
    };
}

async function getInlineFormatSyntaxSettingValue(settingKey: string): Promise<InlineFormatSyntaxMode> {
    const value: unknown = await joplin.settings.value(settingKey);
    return value === INLINE_FORMAT_MARKDOWN_SYNTAX ? INLINE_FORMAT_MARKDOWN_SYNTAX : INLINE_FORMAT_HTML_SYNTAX;
}

export async function getSuperscriptSyntaxSettingValue(): Promise<InlineFormatSyntaxMode> {
    return getInlineFormatSyntaxSettingValue(SUPERSCRIPT_SYNTAX_SETTING);
}

export async function getSubscriptSyntaxSettingValue(): Promise<InlineFormatSyntaxMode> {
    return getInlineFormatSyntaxSettingValue(SUBSCRIPT_SYNTAX_SETTING);
}
