import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

export const INSERT_NOTE_ALERT_COMMAND_NAME = 'markdownAlerts.insertNoteAlert';
export const INSERT_NOTE_ALERT_ACCELERATOR = 'Ctrl+Shift+A';
const INSERT_ALERT_OR_TOGGLE_COMMAND = 'markdownAlerts.insertAlertOrToggle';

export const INSERT_NOTE_QUOTE_COMMAND_NAME = 'markdownAlerts.insertNoteQuote';
export const INSERT_NOTE_QUOTE_ACCELERATOR = 'Ctrl+Shift+.';
const INSERT_QUOTE_OR_TOGGLE_COMMAND = 'markdownAlerts.insertQuoteOrToggle';

const INSERT_NOTE_ALERT_MENU_ITEM_ID = 'markdownAlerts.insertNoteAlert.menuItem';
const INSERT_NOTE_ALERT_TOOLBAR_BUTTON_ID = 'markdownAlerts.insertNoteAlert.toolbarButton';
const INSERT_NOTE_ALERT_ICON_NAME = 'fas fa-exclamation-circle';

const INSERT_NOTE_QUOTE_MENU_ITEM_ID = 'markdownAlerts.insertNoteQuote.menuItem';
const INSERT_NOTE_QUOTE_TOOLBAR_BUTTON_ID = 'markdownAlerts.insertNoteQuote.toolbarButton';
const INSERT_NOTE_QUOTE_ICON_NAME = 'fas fa-quote-right';

export async function registerInsertNoteAlertCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_ALERT_COMMAND_NAME,
        label: 'Insert or Toggle Markdown Alert',
        iconName: INSERT_NOTE_ALERT_ICON_NAME,
        execute: async () => {
            const isMarkdown = !!(await joplin.settings.globalValue('editor.codeView'));
            if (!isMarkdown) {
                await joplin.views.dialogs.showToast({
                    message: 'Markdown Alerts: This command only works in the Markdown editor',
                    type: ToastType.Info,
                });
                return;
            }

            try {
                await joplin.commands.execute('editor.execCommand', {
                    name: INSERT_ALERT_OR_TOGGLE_COMMAND,
                });
            } catch {
                await joplin.views.dialogs.showToast({
                    message: 'Markdown Alerts: Failed to run editor command.',
                    type: ToastType.Error,
                });
            }
        },
    });

    await joplin.views.menuItems.create(
        INSERT_NOTE_ALERT_MENU_ITEM_ID,
        INSERT_NOTE_ALERT_COMMAND_NAME,
        MenuItemLocation.Edit,
        {
            accelerator: INSERT_NOTE_ALERT_ACCELERATOR,
        }
    );

    await joplin.views.toolbarButtons.create(
        INSERT_NOTE_ALERT_TOOLBAR_BUTTON_ID,
        INSERT_NOTE_ALERT_COMMAND_NAME,
        ToolbarButtonLocation.EditorToolbar
    );
}

export async function registerInsertNoteQuoteCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_QUOTE_COMMAND_NAME,
        label: 'Insert or Toggle Blockquote',
        iconName: INSERT_NOTE_QUOTE_ICON_NAME,
        execute: async () => {
            const isMarkdown = !!(await joplin.settings.globalValue('editor.codeView'));
            if (!isMarkdown) {
                await joplin.views.dialogs.showToast({
                    message: 'Markdown Alerts: This command only works in the Markdown editor',
                    type: ToastType.Info,
                });
                return;
            }

            try {
                await joplin.commands.execute('editor.execCommand', {
                    name: INSERT_QUOTE_OR_TOGGLE_COMMAND,
                });
            } catch {
                await joplin.views.dialogs.showToast({
                    message: 'Markdown Alerts: Failed to run editor command.',
                    type: ToastType.Error,
                });
            }
        },
    });

    await joplin.views.menuItems.create(
        INSERT_NOTE_QUOTE_MENU_ITEM_ID,
        INSERT_NOTE_QUOTE_COMMAND_NAME,
        MenuItemLocation.Edit,
        {
            accelerator: INSERT_NOTE_QUOTE_ACCELERATOR,
        }
    );

    await joplin.views.toolbarButtons.create(
        INSERT_NOTE_QUOTE_TOOLBAR_BUTTON_ID,
        INSERT_NOTE_QUOTE_COMMAND_NAME,
        ToolbarButtonLocation.EditorToolbar
    );
}
