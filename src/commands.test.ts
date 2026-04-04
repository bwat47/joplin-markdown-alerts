import type { Command, EditorCommand } from 'api/types';

const settingsValues = new Map<string, unknown>();

const mockJoplin = {
    commands: {
        execute: jest.fn(),
        register: jest.fn(),
    },
    settings: {
        globalValue: jest.fn(),
        value: jest.fn(),
    },
    views: {
        dialogs: {
            showToast: jest.fn(),
        },
        menuItems: {
            create: jest.fn(),
        },
        toolbarButtons: {
            create: jest.fn(),
        },
    },
};

jest.mock(
    'api',
    () => ({
        __esModule: true,
        default: mockJoplin,
    }),
    { virtual: true }
);

jest.mock(
    'api/types',
    () => ({
        __esModule: true,
        MenuItemLocation: {
            Edit: 'edit',
        },
        ToastType: {
            Info: 'info',
            Error: 'error',
        },
        ToolbarButtonLocation: {
            EditorToolbar: 'editorToolbar',
        },
    }),
    { virtual: true }
);

import { registerClearMarkdownFormattingCommand, registerInlineFormatCommands } from './commands';
import {
    INLINE_FORMAT_HTML_SYNTAX,
    INLINE_FORMAT_MARKDOWN_SYNTAX,
    type InlineFormatSyntaxMode,
} from './inlineFormatCommands';
import {
    SHOW_CLEAR_FORMATTING_TOOLBAR_BUTTON_SETTING,
    SUBSCRIPT_SYNTAX_SETTING,
    SUPERSCRIPT_SYNTAX_SETTING,
} from './settings';

function getRegisteredCommand(name: string): Command {
    const registration = mockJoplin.commands.register.mock.calls.find(
        ([command]: [Command]) => command.name === name
    ) as [Command] | undefined;

    if (!registration) {
        throw new Error(`Missing command registration for ${name}`);
    }

    return registration[0];
}

function setSyntaxSetting(settingKey: string, value: InlineFormatSyntaxMode): void {
    settingsValues.set(settingKey, value);
}

describe('registerInlineFormatCommands', () => {
    beforeEach(() => {
        settingsValues.clear();
        setSyntaxSetting(SUPERSCRIPT_SYNTAX_SETTING, INLINE_FORMAT_HTML_SYNTAX);
        setSyntaxSetting(SUBSCRIPT_SYNTAX_SETTING, INLINE_FORMAT_HTML_SYNTAX);

        mockJoplin.commands.execute.mockReset();
        mockJoplin.commands.execute.mockResolvedValue(undefined);
        mockJoplin.commands.register.mockReset();
        mockJoplin.commands.register.mockResolvedValue(undefined);

        mockJoplin.settings.globalValue.mockReset();
        mockJoplin.settings.globalValue.mockResolvedValue(true);
        mockJoplin.settings.value.mockReset();
        mockJoplin.settings.value.mockImplementation(async (settingKey: string) => {
            if (settingsValues.has(settingKey)) {
                return settingsValues.get(settingKey);
            }

            return true;
        });

        mockJoplin.views.dialogs.showToast.mockReset();
        mockJoplin.views.dialogs.showToast.mockResolvedValue(undefined);
        mockJoplin.views.menuItems.create.mockReset();
        mockJoplin.views.menuItems.create.mockResolvedValue(undefined);
        mockJoplin.views.toolbarButtons.create.mockReset();
        mockJoplin.views.toolbarButtons.create.mockResolvedValue(undefined);
    });

    test('superscript command uses HTML syntax by default', async () => {
        await registerInlineFormatCommands();

        await getRegisteredCommand('markdownAlerts.insertSuperscript').execute();

        expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
            name: 'markdownAlerts.insertSuperscriptHtmlOrToggle',
        } satisfies EditorCommand);
    });

    test('subscript command uses HTML syntax by default', async () => {
        await registerInlineFormatCommands();

        await getRegisteredCommand('markdownAlerts.insertSubscript').execute();

        expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
            name: 'markdownAlerts.insertSubscriptHtmlOrToggle',
        } satisfies EditorCommand);
    });

    test('superscript command uses markdown syntax when configured', async () => {
        setSyntaxSetting(SUPERSCRIPT_SYNTAX_SETTING, INLINE_FORMAT_MARKDOWN_SYNTAX);
        await registerInlineFormatCommands();

        await getRegisteredCommand('markdownAlerts.insertSuperscript').execute();

        expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
            name: 'markdownAlerts.insertSuperscriptMarkdownOrToggle',
        } satisfies EditorCommand);
    });

    test('subscript command uses markdown syntax when configured', async () => {
        setSyntaxSetting(SUBSCRIPT_SYNTAX_SETTING, INLINE_FORMAT_MARKDOWN_SYNTAX);
        await registerInlineFormatCommands();

        await getRegisteredCommand('markdownAlerts.insertSubscript').execute();

        expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
            name: 'markdownAlerts.insertSubscriptMarkdownOrToggle',
        } satisfies EditorCommand);
    });
});

describe('registerClearMarkdownFormattingCommand', () => {
    beforeEach(() => {
        mockJoplin.commands.execute.mockReset();
        mockJoplin.commands.execute.mockResolvedValue(undefined);
        mockJoplin.commands.register.mockReset();
        mockJoplin.commands.register.mockResolvedValue(undefined);
        mockJoplin.settings.globalValue.mockReset();
        mockJoplin.settings.globalValue.mockResolvedValue(true);
        mockJoplin.settings.value.mockReset();
        mockJoplin.settings.value.mockResolvedValue(true);
        mockJoplin.views.dialogs.showToast.mockReset();
        mockJoplin.views.dialogs.showToast.mockResolvedValue(undefined);
        mockJoplin.views.menuItems.create.mockReset();
        mockJoplin.views.menuItems.create.mockResolvedValue(undefined);
        mockJoplin.views.toolbarButtons.create.mockReset();
        mockJoplin.views.toolbarButtons.create.mockResolvedValue(undefined);
    });

    test('clear formatting command executes the CodeMirror clear-formatting editor command', async () => {
        await registerClearMarkdownFormattingCommand();

        await getRegisteredCommand('markdownAlerts.clearMarkdownFormatting').execute();

        expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
            name: 'markdownAlerts.clearFormatting',
        } satisfies EditorCommand);
    });

    test('creates a toolbar button when enabled', async () => {
        await registerClearMarkdownFormattingCommand();

        expect(mockJoplin.views.toolbarButtons.create).toHaveBeenCalledWith(
            'markdownAlerts.clearMarkdownFormatting.toolbarButton',
            'markdownAlerts.clearMarkdownFormatting',
            'editorToolbar'
        );
    });

    test('does not create a toolbar button when disabled', async () => {
        mockJoplin.settings.value.mockImplementation(async (settingKey: string) =>
            settingKey === SHOW_CLEAR_FORMATTING_TOOLBAR_BUTTON_SETTING ? false : true
        );

        await registerClearMarkdownFormattingCommand();

        expect(mockJoplin.views.toolbarButtons.create).not.toHaveBeenCalled();
    });
});
