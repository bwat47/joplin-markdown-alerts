import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';

export const INSERT_NOTE_ALERT_COMMAND_NAME = 'markdownAlerts.insertNoteAlert';
export const INSERT_NOTE_ALERT_TEXT = '> [!NOTE] ';
export const INSERT_NOTE_ALERT_ACCELERATOR = 'Ctrl+Shift+A';

const INSERT_NOTE_ALERT_MENU_ITEM_ID = 'markdownAlerts.insertNoteAlert.menuItem';
const INSERT_NOTE_ALERT_TOOLBAR_BUTTON_ID = 'markdownAlerts.insertNoteAlert.toolbarButton';

export async function registerInsertNoteAlertCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_ALERT_COMMAND_NAME,
        label: 'Insert Markdown Alert',
        iconName: 'fas fa-exclamation-circle',
        execute: async () => {
            try {
                await joplin.commands.execute('editor.execCommand', {
                    name: 'markdownAlerts.insertAlertOrToggle',
                });
            } catch {
                await joplin.commands.execute('insertText', INSERT_NOTE_ALERT_TEXT);
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
