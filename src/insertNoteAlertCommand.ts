import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

export const INSERT_NOTE_ALERT_COMMAND_NAME = 'markdownAlerts.insertNoteAlert';
export const INSERT_NOTE_ALERT_TEXT = '> [!NOTE] ';
export const INSERT_NOTE_ALERT_ACCELERATOR = 'Ctrl+Shift+A';

const INSERT_NOTE_ALERT_MENU_ITEM_ID = 'markdownAlerts.insertNoteAlert.menuItem';
const INSERT_NOTE_ALERT_TOOLBAR_BUTTON_ID = 'markdownAlerts.insertNoteAlert.toolbarButton';

export async function registerInsertNoteAlertCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_ALERT_COMMAND_NAME,
        label: 'Insert or Toggle Markdown Alert',
        iconName: 'fas fa-exclamation-circle',
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
                    name: 'markdownAlerts.insertAlertOrToggle',
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
