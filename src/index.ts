import joplin from 'api';
import { ContentScriptType } from 'api/types';

import { logger } from './logger';

joplin.plugins.register({
    onStart: async function () {
        logger.info('Markdown Alerts plugin started');

        await joplin.contentScripts.register(
            ContentScriptType.MarkdownItPlugin,
            'markdownAlerts.markdownIt',
            './contentScripts/markdownIt/ghAlerts.js'
        );

        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            'markdownAlerts.codeMirror',
            './contentScripts/codeMirror/ghAlertsEditor.js'
        );
    },
});
