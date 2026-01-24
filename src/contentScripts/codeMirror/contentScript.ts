import { EditorView } from '@codemirror/view';
import type { CodeMirrorControl } from 'api/types';

import { createAlertDecorationExtensions } from './alertDecorations';
import { createInsertAlertCommand } from './insertAlertCommand';
import { logger } from '../../logger';

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

            editorControl.registerCommand(
                'markdownAlerts.insertAlertOrToggle',
                createInsertAlertCommand(editorControl.cm6)
            );
        },
    };
}
