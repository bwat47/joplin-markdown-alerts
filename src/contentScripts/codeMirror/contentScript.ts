import { EditorView } from '@codemirror/view';
import type { CodeMirrorControl } from 'api/types';

import { createAlertDecorationExtensions } from './alertDecorations';
import { createInsertAlertCommand } from './insertAlertCommand';
import { createQuoteSelectionCommand } from './quoteCommand';
import { logger } from '../../logger';

const INSERT_ALERT_COMMAND = 'markdownAlerts.insertAlertOrToggle';
const QUOTE_SELECTION_COMMAND = 'markdownAlerts.quoteSelection';

/**
 * Joplin CodeMirror content script entry point.
 *
 * Registers the alert decorations extension and the insertAlertOrToggle command.
 */
export default function () {
    return {
        plugin: function (editorControl: CodeMirrorControl) {
            if (!editorControl?.cm6) {
                logger.warn('CodeMirror 6 not available; skipping markdown alert extensions.');
                return;
            }

            // Detect dark theme from the editor state
            const editor = editorControl.editor as EditorView;
            const isDarkTheme = editor?.state?.facet(EditorView.darkTheme) ?? false;

            editorControl.addExtension(createAlertDecorationExtensions(isDarkTheme));

            editorControl.registerCommand(INSERT_ALERT_COMMAND, createInsertAlertCommand(editorControl.cm6));

            editorControl.registerCommand(QUOTE_SELECTION_COMMAND, createQuoteSelectionCommand(editorControl.cm6));
        },
    };
}
