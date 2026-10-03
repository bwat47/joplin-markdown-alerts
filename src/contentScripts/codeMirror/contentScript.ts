import { EditorView } from '@codemirror/view';
import type { CodeMirrorControl, ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';

import { createAlertCompletionSource } from './alerts/alertAutocomplete';
import { createAlertAutocompleteThemeExtension } from './alerts/alertAutocompleteTheme';
import { createAlertDecorationExtensions } from './alerts/alertDecorations';
import { createClearFormattingCommand } from './commands/clearFormattingCommand';
import { createInsertAlertCommand } from './commands/insertAlertCommand';
import { createInsertInlineFormatCommand } from './commands/insertInlineFormatCommand';
import { createInsertQuoteCommand } from './commands/insertQuoteCommand';
import { applyMarkdownAlertEditorSettings, createMarkdownAlertEditorSettingsExtension } from './pluginSettings';
import { GET_EDITOR_SETTINGS_MESSAGE } from '../../editorSettingsMessage';
import { INLINE_FORMAT_DEFINITIONS } from '../../inlineFormatCommands';
import { logger } from '../../logger';

const INSERT_ALERT_COMMAND = 'markdownAlerts.insertAlertOrToggle';
const CLEAR_FORMATTING_COMMAND = 'markdownAlerts.clearFormatting';
const INSERT_QUOTE_COMMAND = 'markdownAlerts.insertQuoteOrToggle';

/**
 * Joplin CodeMirror content script entry point.
 *
 * Registers the alert decorations extension and the editor commands for alerts and blockquotes.
 */
export default function (context: ContentScriptContext): MarkdownEditorContentScriptModule {
    return {
        plugin: async function (editorControl: CodeMirrorControl) {
            if (!editorControl?.cm6) {
                logger.warn('CodeMirror 6 not available; skipping markdown alert extensions.');
                return;
            }

            // Detect dark theme from the editor state
            const editor = editorControl.editor as EditorView;
            const isDarkTheme = editor?.state?.facet(EditorView.darkTheme) ?? false;

            editorControl.addExtension(createMarkdownAlertEditorSettingsExtension());
            editorControl.addExtension(createAlertDecorationExtensions(isDarkTheme));
            editorControl.addExtension(createAlertAutocompleteThemeExtension(isDarkTheme));
            editorControl.addExtension(editorControl.joplinExtensions.completionSource(createAlertCompletionSource()));

            editorControl.registerCommand(INSERT_ALERT_COMMAND, createInsertAlertCommand(editor));
            editorControl.registerCommand(CLEAR_FORMATTING_COMMAND, createClearFormattingCommand(editor));
            editorControl.registerCommand(INSERT_QUOTE_COMMAND, createInsertQuoteCommand(editor));
            for (const format of INLINE_FORMAT_DEFINITIONS) {
                editorControl.registerCommand(
                    format.editorCommandName,
                    createInsertInlineFormatCommand(editor, format)
                );
            }

            let settings: Record<string, unknown> | null = null;
            try {
                const response: unknown = await context.postMessage({ type: GET_EDITOR_SETTINGS_MESSAGE });
                if (typeof response === 'object' && response !== null) {
                    settings = response as Record<string, unknown>;
                }
            } catch (err) {
                logger.warn('Failed to fetch editor settings; defaulting to enabled.', err);
            }

            applyMarkdownAlertEditorSettings(editor, {
                enableAlertAutocomplete: settings?.enableAlertAutocomplete !== false,
                renderAlertTitles: settings?.renderAlertTitles !== false,
                showAlertBackground: settings?.showAlertBackground !== false,
            });
        },
    };
}
