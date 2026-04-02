export type InlineFormatDefinition = {
    id: 'highlight' | 'strikethrough' | 'underline' | 'superscript' | 'subscript';
    label: string;
    openingDelimiter: string;
    closingDelimiter: string;
    globalCommandName: string;
    editorCommandName: string;
    toolbarButtonId: string;
    toolbarButtonSettingKey: string;
    toolbarButtonSettingLabel: string;
    menuItemId: string;
    iconName: string;
    accelerator?: string;
    conflictingLongerDelimiters?: string[];
};

export const INLINE_FORMAT_COMMANDS: InlineFormatDefinition[] = [
    {
        id: 'highlight',
        label: 'Insert or Toggle Highlight',
        openingDelimiter: '==',
        closingDelimiter: '==',
        globalCommandName: 'markdownAlerts.insertHighlight',
        editorCommandName: 'markdownAlerts.insertHighlightOrToggle',
        toolbarButtonId: 'markdownAlerts.insertHighlight.toolbarButton',
        toolbarButtonSettingKey: 'showHighlightToolbarButton',
        toolbarButtonSettingLabel: 'Show Highlight toolbar button',
        menuItemId: 'markdownAlerts.insertHighlight.menuItem',
        iconName: 'fas fa-highlighter',
        accelerator: 'CmdOrCtrl+Shift+Y',
    },
    {
        id: 'strikethrough',
        label: 'Insert or Toggle Strikethrough',
        openingDelimiter: '~~',
        closingDelimiter: '~~',
        globalCommandName: 'markdownAlerts.insertStrikethrough',
        editorCommandName: 'markdownAlerts.insertStrikethroughOrToggle',
        toolbarButtonId: 'markdownAlerts.insertStrikethrough.toolbarButton',
        toolbarButtonSettingKey: 'showStrikethroughToolbarButton',
        toolbarButtonSettingLabel: 'Show Strikethrough toolbar button',
        menuItemId: 'markdownAlerts.insertStrikethrough.menuItem',
        iconName: 'fas fa-strikethrough',
        accelerator: 'CmdOrCtrl+Shift+`',
    },
    {
        id: 'underline',
        label: 'Insert or Toggle Underline',
        openingDelimiter: '++',
        closingDelimiter: '++',
        globalCommandName: 'markdownAlerts.insertUnderline',
        editorCommandName: 'markdownAlerts.insertUnderlineOrToggle',
        toolbarButtonId: 'markdownAlerts.insertUnderline.toolbarButton',
        toolbarButtonSettingKey: 'showUnderlineToolbarButton',
        toolbarButtonSettingLabel: 'Show Underline toolbar button',
        menuItemId: 'markdownAlerts.insertUnderline.menuItem',
        iconName: 'fas fa-underline',
        accelerator: 'CmdOrCtrl+Shift+U',
    },
    {
        id: 'superscript',
        label: 'Insert or Toggle Superscript',
        openingDelimiter: '^',
        closingDelimiter: '^',
        globalCommandName: 'markdownAlerts.insertSuperscript',
        editorCommandName: 'markdownAlerts.insertSuperscriptOrToggle',
        toolbarButtonId: 'markdownAlerts.insertSuperscript.toolbarButton',
        toolbarButtonSettingKey: 'showSuperscriptToolbarButton',
        toolbarButtonSettingLabel: 'Show Superscript toolbar button',
        menuItemId: 'markdownAlerts.insertSuperscript.menuItem',
        iconName: 'fas fa-superscript',
    },
    {
        id: 'subscript',
        label: 'Insert or Toggle Subscript',
        openingDelimiter: '~',
        closingDelimiter: '~',
        globalCommandName: 'markdownAlerts.insertSubscript',
        editorCommandName: 'markdownAlerts.insertSubscriptOrToggle',
        toolbarButtonId: 'markdownAlerts.insertSubscript.toolbarButton',
        toolbarButtonSettingKey: 'showSubscriptToolbarButton',
        toolbarButtonSettingLabel: 'Show Subscript toolbar button',
        menuItemId: 'markdownAlerts.insertSubscript.menuItem',
        iconName: 'fas fa-subscript',
        conflictingLongerDelimiters: ['~~'],
    },
];
