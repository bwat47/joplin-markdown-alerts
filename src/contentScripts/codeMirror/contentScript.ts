import { EditorView } from '@codemirror/view';

import { createAlertDecorationExtensions } from './alertDecorations';
import { createInsertAlertCommand } from './insertAlertCommand';

interface EditorControl {
    editor: EditorView;
    cm6: EditorView;
    addExtension: (extension: unknown) => void;
    registerCommand: (name: string, callback: (...args: unknown[]) => unknown) => void;
}

/**
 * Joplin CodeMirror content script entry point.
 *
 * Registers the alert decorations extension and the insertAlertOrToggle command.
 */
export default function () {
    return {
        plugin: function (codeMirrorOrEditorControl: unknown) {
            if (!codeMirrorOrEditorControl || typeof codeMirrorOrEditorControl !== 'object') return;

            const editorControl = codeMirrorOrEditorControl as Partial<EditorControl>;
            if (typeof editorControl.addExtension !== 'function') return;
            if (typeof editorControl.registerCommand !== 'function') return;
            if (!editorControl.cm6) return;

            // Detect dark theme from the editor state
            const editor = editorControl.editor;
            const isDarkTheme = editor?.state?.facet(EditorView.darkTheme) ?? false;

            editorControl.addExtension(createAlertDecorationExtensions(isDarkTheme));

            editorControl.registerCommand(
                'markdownAlerts.insertAlertOrToggle',
                createInsertAlertCommand(editorControl.cm6)
            );
        },
    };
}
