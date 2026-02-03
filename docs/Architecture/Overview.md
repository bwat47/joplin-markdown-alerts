# Architecture overview (internal)

## Goal

Render GitHub-style Markdown alerts in both Joplin's viewer and CodeMirror 6 editor.

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

- `src/contentScripts/codeMirror/contentScript.ts` - Content script entry point; registers extensions and editor commands
- `src/contentScripts/codeMirror/alertDecorations.ts` - CM6 decorations extension (base styles + themed colors + view plugin)
- `src/contentScripts/codeMirror/alertParsing.ts` - Parses `> [!TYPE]` title lines and defines alert type constants
- `src/contentScripts/codeMirror/alertIcons.ts` - Octicon SVG icons used in the inline title widget
- `src/contentScripts/codeMirror/alertColors.ts` - Light/dark theme color tokens used by the CM6 decorations
- `src/contentScripts/codeMirror/insertAlertCommand.ts` - Editor command logic (insert/toggle/convert blockquote, selection-aware)
- `src/contentScripts/codeMirror/insertQuoteCommand.ts` - Editor command logic for quoting/toggling selected text
- `src/commands.ts` - Registers global Joplin commands (alerts + quote, toolbar + shortcuts)

### Commands

- `markdownAlerts.insertNoteAlert`: Global command (accessible via menu/shortcut)
-   - Executes `markdownAlerts.insertAlertOrToggle` in the editor (registered by the CM content script) to insert a new alert, toggle alert types on existing alerts, or convert a blockquote to an alert.
-   - When text is selected, it operates on the selection: non-quotes become an alert; quoted selections toggle alert type or get a new marker line.
- `markdownAlerts.insertNoteQuote`: Global command (toolbar + shortcut)
-   - Executes `markdownAlerts.insertQuoteOrToggle` in the editor to quote selected text or remove quote markers when all selected lines are quoted.

## Design Principles

- Markdown Editor implementation uses styling (line decorations) and inline widgets (no heavy block widgets)
- Single detection path via `parseGitHubAlertTitleLine` with regex derived from `GITHUB_ALERT_TYPES`
- Consistent styling between editor and viewer (4px border, transparent backgrounds, matching colors, octicon SVGs)
