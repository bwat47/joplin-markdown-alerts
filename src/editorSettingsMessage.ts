/**
 * Message type sent by the CodeMirror content script to fetch its editor settings from the plugin.
 *
 * Kept in a dependency-free module so both the plugin and content script bundles can import it.
 */
export const GET_EDITOR_SETTINGS_MESSAGE = 'getEditorSettings';
