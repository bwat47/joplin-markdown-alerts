import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

import {
    getInlineFormatEditorCommandName,
    isConfigurableInlineFormatId,
    INLINE_FORMAT_COMMANDS,
    type InlineFormatCommandDefinition,
} from './inlineFormatCommands';
import {
    getSubscriptSyntaxSettingValue,
    getSuperscriptSyntaxSettingValue,
    isToolbarButtonEnabled,
    SHOW_ALERT_TOOLBAR_BUTTON_SETTING,
    SHOW_QUOTE_TOOLBAR_BUTTON_SETTING,
} from './settings';

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

async function executeMarkdownEditorCommand(commandName: string): Promise<void> {
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
            name: commandName,
        });
    } catch {
        await joplin.views.dialogs.showToast({
            message: 'Markdown Alerts: Failed to run editor command.',
            type: ToastType.Error,
        });
    }
}

async function createToolbarButtonIfEnabled(
    settingKey: string,
    toolbarButtonId: string,
    commandName: string
): Promise<void> {
    if (!(await isToolbarButtonEnabled(settingKey))) {
        return;
    }

    await joplin.views.toolbarButtons.create(toolbarButtonId, commandName, ToolbarButtonLocation.EditorToolbar);
}

async function resolveInlineFormatEditorCommandName(format: InlineFormatCommandDefinition): Promise<string> {
    if (!isConfigurableInlineFormatId(format.id)) {
        return format.defaultEditorCommandName;
    }

    const syntaxMode =
        format.id === 'superscript'
            ? await getSuperscriptSyntaxSettingValue()
            : await getSubscriptSyntaxSettingValue();

    return getInlineFormatEditorCommandName(format.id, syntaxMode);
}

export async function registerInsertNoteAlertCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_ALERT_COMMAND_NAME,
        label: 'Insert or Toggle Markdown Alert',
        iconName: INSERT_NOTE_ALERT_ICON_NAME,
        execute: async () => {
            await executeMarkdownEditorCommand(INSERT_ALERT_OR_TOGGLE_COMMAND);
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

    await createToolbarButtonIfEnabled(
        SHOW_ALERT_TOOLBAR_BUTTON_SETTING,
        INSERT_NOTE_ALERT_TOOLBAR_BUTTON_ID,
        INSERT_NOTE_ALERT_COMMAND_NAME
    );
}

export async function registerInsertNoteQuoteCommand(): Promise<void> {
    await joplin.commands.register({
        name: INSERT_NOTE_QUOTE_COMMAND_NAME,
        label: 'Insert or Toggle Blockquote',
        iconName: INSERT_NOTE_QUOTE_ICON_NAME,
        execute: async () => {
            await executeMarkdownEditorCommand(INSERT_QUOTE_OR_TOGGLE_COMMAND);
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

    await createToolbarButtonIfEnabled(
        SHOW_QUOTE_TOOLBAR_BUTTON_SETTING,
        INSERT_NOTE_QUOTE_TOOLBAR_BUTTON_ID,
        INSERT_NOTE_QUOTE_COMMAND_NAME
    );
}

async function registerInlineFormatCommand(format: InlineFormatCommandDefinition): Promise<void> {
    await joplin.commands.register({
        name: format.globalCommandName,
        label: format.label,
        iconName: format.iconName,
        execute: async () => {
            await executeMarkdownEditorCommand(await resolveInlineFormatEditorCommandName(format));
        },
    });

    if (format.accelerator) {
        await joplin.views.menuItems.create(format.menuItemId, format.globalCommandName, MenuItemLocation.Edit, {
            accelerator: format.accelerator,
        });
    } else {
        await joplin.views.menuItems.create(format.menuItemId, format.globalCommandName, MenuItemLocation.Edit);
    }

    await createToolbarButtonIfEnabled(
        format.toolbarButtonSettingKey,
        format.toolbarButtonId,
        format.globalCommandName
    );
}

export async function registerInlineFormatCommands(): Promise<void> {
    for (const format of INLINE_FORMAT_COMMANDS) {
        await registerInlineFormatCommand(format);
    }
}
