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

export function createMarkdownAlertEditorSettingsExtension(
    settings: MarkdownAlertEditorSettings = DEFAULT_MARKDOWN_ALERT_EDITOR_SETTINGS
): Extension {
    return markdownAlertEditorSettingsCompartment.of(markdownAlertEditorSettingsFacet.of(settings));
}

export function applyMarkdownAlertEditorSettings(view: EditorView, settings: MarkdownAlertEditorSettings): void {
    view.dispatch({
        effects: markdownAlertEditorSettingsCompartment.reconfigure(markdownAlertEditorSettingsFacet.of(settings)),
    });
}
