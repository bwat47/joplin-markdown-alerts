import joplin from 'api';
import { ContentScriptType } from 'api/types';

import { logger } from './logger';
import { registerInsertNoteAlertCommand, registerQuoteSelectionCommand } from './commands';

joplin.plugins.register({
    onStart: async function () {
        logger.info('Markdown Alerts plugin started');

        await registerInsertNoteAlertCommand();
        await registerQuoteSelectionCommand();

        await joplin.contentScripts.register(
            ContentScriptType.MarkdownItPlugin,
            'markdownAlerts.markdownIt',
            './contentScripts/markdownIt/markdownItPlugin.js'
        );

        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            'markdownAlerts.codeMirror',
            './contentScripts/codeMirror/contentScript.js'
        );
    },
});
