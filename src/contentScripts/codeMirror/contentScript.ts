import { EditorView } from '@codemirror/view';
import type { CodeMirrorControl, ContentScriptContext } from 'api/types';

import { createAlertAutocompleteTheme, createAlertCompletionSource } from './alerts/alertAutocomplete';
import { createAlertDecorationExtensions } from './alerts/alertDecorations';
import { createClearFormattingCommand } from './commands/clearFormattingCommand';
import { createInsertAlertCommand } from './commands/insertAlertCommand';
import { createInsertInlineFormatCommand } from './commands/insertInlineFormatCommand';
import { createInsertQuoteCommand } from './commands/insertQuoteCommand';
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
export default function (context: ContentScriptContext) {
    return {
        plugin: async function (editorControl: CodeMirrorControl) {
            if (!editorControl?.cm6) {
                logger.warn('CodeMirror 6 not available; skipping markdown alert extensions.');
                return;
            }

            // Detect dark theme from the editor state
            const editor = editorControl.editor as EditorView;
            const isDarkTheme = editor?.state?.facet(EditorView.darkTheme) ?? false;

            editorControl.addExtension(createAlertDecorationExtensions(isDarkTheme));

            editorControl.registerCommand(INSERT_ALERT_COMMAND, createInsertAlertCommand(editorControl.cm6));
            editorControl.registerCommand(CLEAR_FORMATTING_COMMAND, createClearFormattingCommand(editorControl.cm6));
            editorControl.registerCommand(INSERT_QUOTE_COMMAND, createInsertQuoteCommand(editorControl.cm6));
            for (const format of INLINE_FORMAT_DEFINITIONS) {
                editorControl.registerCommand(
                    format.editorCommandName,
                    createInsertInlineFormatCommand(editorControl.cm6, format)
                );
            }

            let autocompleteEnabled = true;
            try {
                autocompleteEnabled = await context.postMessage({ type: 'getAutocompleteSetting' });
            } catch (err) {
                logger.warn('Failed to fetch autocomplete setting; defaulting to enabled.', err);
            }

            if (autocompleteEnabled !== false) {
                editorControl.addExtension(
                    editorControl.joplinExtensions.completionSource(createAlertCompletionSource())
                );
                editorControl.addExtension(createAlertAutocompleteTheme(isDarkTheme));
            }
        },
    };
}
