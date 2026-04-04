export type InlineFormatId = 'highlight' | 'strikethrough' | 'underline' | 'superscript' | 'subscript';

export type ConfigurableInlineFormatId = 'superscript' | 'subscript';

export type InlineFormatSyntaxMode = 'html' | 'markdown';

export type InlineFormatCommandDefinition = {
    id: InlineFormatId;
    label: string;
    defaultEditorCommandName: string;
    globalCommandName: string;
    toolbarButtonId: string;
    toolbarButtonSettingKey: string;
    toolbarButtonSettingLabel: string;
    menuItemId: string;
    iconName: string;
    accelerator?: string;
};

export type InlineFormatDefinition = {
    id: InlineFormatId;
    editorCommandName: string;
    openingDelimiter: string;
    closingDelimiter: string;
    conflictingLongerDelimiters?: string[];
    syntaxMode?: InlineFormatSyntaxMode;
};

export const INLINE_FORMAT_HTML_SYNTAX: InlineFormatSyntaxMode = 'html';
export const INLINE_FORMAT_MARKDOWN_SYNTAX: InlineFormatSyntaxMode = 'markdown';

const DEFAULT_CONFIGURABLE_INLINE_FORMAT_SYNTAX: Record<ConfigurableInlineFormatId, InlineFormatSyntaxMode> = {
    superscript: INLINE_FORMAT_HTML_SYNTAX,
    subscript: INLINE_FORMAT_HTML_SYNTAX,
};

export const INLINE_FORMAT_COMMANDS: InlineFormatCommandDefinition[] = [
    {
        id: 'highlight',
        label: 'Insert or Toggle Highlight',
        defaultEditorCommandName: 'markdownAlerts.insertHighlightOrToggle',
        globalCommandName: 'markdownAlerts.insertHighlight',
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
        defaultEditorCommandName: 'markdownAlerts.insertStrikethroughOrToggle',
        globalCommandName: 'markdownAlerts.insertStrikethrough',
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
        defaultEditorCommandName: 'markdownAlerts.insertUnderlineOrToggle',
        globalCommandName: 'markdownAlerts.insertUnderline',
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
        defaultEditorCommandName: 'markdownAlerts.insertSuperscriptHtmlOrToggle',
        globalCommandName: 'markdownAlerts.insertSuperscript',
        toolbarButtonId: 'markdownAlerts.insertSuperscript.toolbarButton',
        toolbarButtonSettingKey: 'showSuperscriptToolbarButton',
        toolbarButtonSettingLabel: 'Show Superscript toolbar button',
        menuItemId: 'markdownAlerts.insertSuperscript.menuItem',
        iconName: 'fas fa-superscript',
    },
    {
        id: 'subscript',
        label: 'Insert or Toggle Subscript',
        defaultEditorCommandName: 'markdownAlerts.insertSubscriptHtmlOrToggle',
        globalCommandName: 'markdownAlerts.insertSubscript',
        toolbarButtonId: 'markdownAlerts.insertSubscript.toolbarButton',
        toolbarButtonSettingKey: 'showSubscriptToolbarButton',
        toolbarButtonSettingLabel: 'Show Subscript toolbar button',
        menuItemId: 'markdownAlerts.insertSubscript.menuItem',
        iconName: 'fas fa-subscript',
    },
];

export const INLINE_FORMAT_DEFINITIONS: InlineFormatDefinition[] = [
    {
        id: 'highlight',
        editorCommandName: 'markdownAlerts.insertHighlightOrToggle',
        openingDelimiter: '==',
        closingDelimiter: '==',
    },
    {
        id: 'strikethrough',
        editorCommandName: 'markdownAlerts.insertStrikethroughOrToggle',
        openingDelimiter: '~~',
        closingDelimiter: '~~',
    },
    {
        id: 'underline',
        editorCommandName: 'markdownAlerts.insertUnderlineOrToggle',
        openingDelimiter: '++',
        closingDelimiter: '++',
    },
    {
        id: 'superscript',
        syntaxMode: INLINE_FORMAT_MARKDOWN_SYNTAX,
        editorCommandName: 'markdownAlerts.insertSuperscriptMarkdownOrToggle',
        openingDelimiter: '^',
        closingDelimiter: '^',
    },
    {
        id: 'superscript',
        syntaxMode: INLINE_FORMAT_HTML_SYNTAX,
        editorCommandName: 'markdownAlerts.insertSuperscriptHtmlOrToggle',
        openingDelimiter: '<sup>',
        closingDelimiter: '</sup>',
    },
    {
        id: 'subscript',
        syntaxMode: INLINE_FORMAT_MARKDOWN_SYNTAX,
        editorCommandName: 'markdownAlerts.insertSubscriptMarkdownOrToggle',
        openingDelimiter: '~',
        closingDelimiter: '~',
        conflictingLongerDelimiters: ['~~'],
    },
    {
        id: 'subscript',
        syntaxMode: INLINE_FORMAT_HTML_SYNTAX,
        editorCommandName: 'markdownAlerts.insertSubscriptHtmlOrToggle',
        openingDelimiter: '<sub>',
        closingDelimiter: '</sub>',
    },
];

export function isConfigurableInlineFormatId(id: InlineFormatId): id is ConfigurableInlineFormatId {
    return id === 'superscript' || id === 'subscript';
}

export function getDefaultInlineFormatSyntaxMode(id: ConfigurableInlineFormatId): InlineFormatSyntaxMode {
    return DEFAULT_CONFIGURABLE_INLINE_FORMAT_SYNTAX[id];
}

export function getInlineFormatDefinition(
    id: InlineFormatId,
    syntaxMode?: InlineFormatSyntaxMode
): InlineFormatDefinition {
    const resolvedSyntaxMode = isConfigurableInlineFormatId(id)
        ? (syntaxMode ?? getDefaultInlineFormatSyntaxMode(id))
        : undefined;

    const format = INLINE_FORMAT_DEFINITIONS.find(
        (entry) => entry.id === id && entry.syntaxMode === resolvedSyntaxMode
    );

    if (!format) {
        throw new Error(
            resolvedSyntaxMode
                ? `Missing inline format definition for ${id} (${resolvedSyntaxMode})`
                : `Missing inline format definition for ${id}`
        );
    }

    return format;
}

export function getInlineFormatEditorCommandName(
    id: ConfigurableInlineFormatId,
    syntaxMode: InlineFormatSyntaxMode
): string {
    return getInlineFormatDefinition(id, syntaxMode).editorCommandName;
}
