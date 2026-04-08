# Architecture overview (internal)

## Goal

Render GitHub-style Markdown alerts in both Joplin's viewer and CodeMirror 6 editor, and provide markdown editor commands for alerts, blockquotes, and inline formatting.

GitHub alert syntax:

```md
> [!note]
> This is a test alert
```

## Architecture

### Viewer (Markdown Renderer)

- Joplin `MarkdownItPlugin` content script using `markdown-it-github-alerts` library
- CSS assets loaded via content script `assets()` hook
- Theme detection via `--joplin-appearance` CSS variable with fallback for cross-origin iframes

**Files:**

- `src/contentScripts/markdownIt/markdownItPlugin.ts` - Plugin integration
- `src/contentScripts/markdownIt/alerts.css` - Alert styles with transparent backgrounds
- `src/contentScripts/markdownIt/alerts-theme-*.css` - Theme-specific color variables

### Editor (CodeMirror 6)

- Joplin `CodeMirrorPlugin` content script using line decorations (keeps source visible/editable)
- Detects alert blocks via CM6 syntax tree: finds blockquotes, validates first line matches `> [!TYPE]`
- Implements "clean titles": Replaces `[!TYPE]` marker with an inline widget containing the alert icon and either the alert type name (e.g., "Note", "Tip", "Important", "Warning", "Caution") or a custom title if provided.
- Theme detection via `EditorView.darkTheme` facet at content script initialization
- Applies appropriate color theme based on detected theme (passed into the decorations extension)

**Files:**

- `src/contentScripts/codeMirror/contentScript.ts` - Content script entry point; registers extensions and editor commands.
- `src/contentScripts/codeMirror/alerts/alertDecorations.ts` - CM6 decorations extension (base styles + themed colors + view plugin)
- `src/contentScripts/codeMirror/alerts/alertParsing.ts` - Parses `> [!TYPE]` title lines and defines alert type constants
- `src/contentScripts/codeMirror/alerts/alertIcons.ts` - Octicon SVG icons used in the inline title widget
- `src/contentScripts/codeMirror/alerts/alertColors.ts` - Light/dark theme color tokens used by the CM6 decorations
- `src/contentScripts/codeMirror/commands/insertAlertCommand.ts` - Editor command logic (insert/toggle/convert blockquote, selection-aware)
- `src/contentScripts/codeMirror/commands/insertInlineFormatCommand.ts` - Shared editor command logic for inline formatting (selection-aware, multiline list-aware)
- `src/contentScripts/codeMirror/commands/insertQuoteCommand.ts` - Editor command logic for quoting/toggling selected text
- `src/contentScripts/codeMirror/commands/clearFormattingCommand.ts` - Editor command logic for removing supported markdown formatting from selections
- `src/contentScripts/codeMirror/shared/syntaxTreeUtils.ts` - Shared syntax-tree probing helpers used by CodeMirror commands and decorations
- `src/contentScripts/codeMirror/shared/commandSelectionUtils.ts` - Shared selection-preserving dispatch helper for CodeMirror commands
- `src/inlineFormatCommands.ts` - Shared inline-format command metadata plus syntax-specific editor command definitions for configurable inline formats
- `src/settings.ts` - Plugin settings registration for toolbar button visibility plus superscript/subscript syntax selection
- `src/joplinCommandRegistration.ts` - Registers global Joplin commands (alerts + quote + clear-formatting + inline formatting, toolbar + shortcuts), gates toolbar buttons on plugin settings, and resolves superscript/subscript syntax at execution time

### Commands

- `markdownAlerts.insertNoteAlert`: Global command (accessible via menu/shortcut)
-   - Executes `markdownAlerts.insertAlertOrToggle` in the editor (registered by the CM content script) to insert a new alert, toggle alert types on existing alerts, or convert a blockquote to an alert.
-   - When text is selected, it operates on the selection: non-quotes become an alert; quoted selections toggle alert type or get a new marker line.
- `markdownAlerts.insertNoteQuote`: Global command (toolbar + shortcut)
-   - Executes `markdownAlerts.insertQuoteOrToggle` in the editor to quote selected text or remove quote markers when all selected lines are quoted.
- `markdownAlerts.clearMarkdownFormatting`: Global command (menu/command palette)
-   - Executes `markdownAlerts.clearFormatting` in the editor to remove supported markdown formatting from the current non-empty selection ranges.
-   - Uses a regex-first transformer with targeted structural handling for GitHub alert title lines, headings, blockquotes, ordered/unordered/task lists, links/images, reference links, footnotes, HTML formatting tags, and inline/fenced code placeholders.
-   - Preserves Joplin resource markdown links and embeds (`:/<32 hex>`) while extracting external link/image destinations as raw URLs.
-   - Exposes an optional toolbar button controlled by plugin settings; no default shortcut is assigned.
- `markdownAlerts.insertHighlight` / `markdownAlerts.insertStrikethrough` / `markdownAlerts.insertUnderline` / `markdownAlerts.insertSuperscript` / `markdownAlerts.insertSubscript`
  -   - Execute matching inline-format editor commands registered by the CodeMirror content script.
  -   - Superscript and subscript resolve to either HTML-tag or markdown-delimiter editor commands based on plugin settings.
  -   - Empty selection inserts paired delimiters and places the cursor between them.
  -   - Selected text toggles the target inline delimiter; multiline full-line selections are handled line by line.
  -   - List-aware multiline formatting preserves blockquote prefixes, list markers, and task checkboxes while formatting only item content, and skips code blocks and markdown tables.

### Settings

- Toolbar buttons are controlled by plugin boolean settings, one per button
- Commands and menu items are always registered; only editor toolbar button creation is gated
- Toolbar visibility settings are read at plugin startup, so changes currently require a plugin restart
- Superscript and subscript each expose a public syntax setting (`html` or `markdown`), defaulting to `html`
- Syntax settings are read when the global command executes, so they apply immediately without a plugin restart

## Design Principles

- Markdown Editor implementation uses styling (line decorations) and inline widgets (no heavy block widgets)
- Single detection path via `parseGitHubAlertTitleLine` with regex derived from `GITHUB_ALERT_TYPES`
- Consistent styling between editor and viewer (4px border, transparent backgrounds, matching colors, octicon SVGs)
