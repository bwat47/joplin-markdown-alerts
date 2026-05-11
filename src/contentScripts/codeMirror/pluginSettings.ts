import { Compartment, Facet, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type MarkdownAlertEditorSettings = {
    enableAlertAutocomplete: boolean;
};

export const DEFAULT_MARKDOWN_ALERT_EDITOR_SETTINGS: MarkdownAlertEditorSettings = {
    enableAlertAutocomplete: false,
};

const markdownAlertEditorSettingsFacet = Facet.define<
    MarkdownAlertEditorSettings,
    MarkdownAlertEditorSettings
>({
    combine: (values) => values[0] ?? DEFAULT_MARKDOWN_ALERT_EDITOR_SETTINGS,
});

const markdownAlertEditorSettingsCompartment = new Compartment();

export function getMarkdownAlertEditorSettings(state: EditorState): MarkdownAlertEditorSettings {
    return state.facet(markdownAlertEditorSettingsFacet);
}

export function normalizeMarkdownAlertEditorSettings(value: unknown): MarkdownAlertEditorSettings {
    if (typeof value === 'boolean') {
        return { enableAlertAutocomplete: value };
    }

    if (value && typeof value === 'object') {
        const enableAlertAutocomplete = (value as { enableAlertAutocomplete?: unknown }).enableAlertAutocomplete;
        if (typeof enableAlertAutocomplete === 'boolean') {
            return { enableAlertAutocomplete };
        }
    }

    return DEFAULT_MARKDOWN_ALERT_EDITOR_SETTINGS;
}

export function createMarkdownAlertEditorSettingsExtension(
    settings: MarkdownAlertEditorSettings = DEFAULT_MARKDOWN_ALERT_EDITOR_SETTINGS
): Extension {
    return markdownAlertEditorSettingsCompartment.of(markdownAlertEditorSettingsFacet.of(settings));
}

export function applyMarkdownAlertEditorSettings(view: EditorView, settings: unknown): void {
    view.dispatch({
        effects: markdownAlertEditorSettingsCompartment.reconfigure(
            markdownAlertEditorSettingsFacet.of(normalizeMarkdownAlertEditorSettings(settings))
        ),
    });
}
