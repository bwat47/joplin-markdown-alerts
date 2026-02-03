import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

export const QUOTE_SELECTION_COMMAND_NAME = 'markdownAlerts.quoteSelection';
export const QUOTE_SELECTION_ACCELERATOR = 'Ctrl+Shift+.';

const QUOTE_SELECTION_MENU_ITEM_ID = 'markdownAlerts.quoteSelection.menuItem';
const QUOTE_SELECTION_TOOLBAR_BUTTON_ID = 'markdownAlerts.quoteSelection.toolbarButton';
const QUOTE_SELECTION_ICON_NAME = 'fas fa-quote-right';

export async function registerQuoteSelectionCommand(): Promise<void> {
    await joplin.commands.register({
        name: QUOTE_SELECTION_COMMAND_NAME,
        label: 'Quote Selected Text',
        iconName: QUOTE_SELECTION_ICON_NAME,
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
                const result = await joplin.commands.execute('editor.execCommand', {
                    name: QUOTE_SELECTION_COMMAND_NAME,
                });

                if (result === false) {
                    await joplin.views.dialogs.showToast({
                        message: 'Markdown Alerts: Select text to quote.',
                        type: ToastType.Info,
                    });
                }
            } catch {
                await joplin.views.dialogs.showToast({
                    message: 'Markdown Alerts: Failed to run editor command.',
                    type: ToastType.Error,
                });
            }
        },
    });

    await joplin.views.menuItems.create(
        QUOTE_SELECTION_MENU_ITEM_ID,
        QUOTE_SELECTION_COMMAND_NAME,
        MenuItemLocation.Edit,
        {
            accelerator: QUOTE_SELECTION_ACCELERATOR,
        }
    );

    await joplin.views.toolbarButtons.create(
        QUOTE_SELECTION_TOOLBAR_BUTTON_ID,
        QUOTE_SELECTION_COMMAND_NAME,
        ToolbarButtonLocation.EditorToolbar
    );
}
