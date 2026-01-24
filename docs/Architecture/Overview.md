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
- Theme detection via `EditorView.darkTheme` facet at plugin initialization
- Applies appropriate color theme based on detected theme

**Files:**

- `src/contentScripts/codeMirror/alertDecorations.ts` - CM6 extension with theme detection
- `src/contentScripts/codeMirror/alertParsing.ts` - Parses `> [!TYPE]` title lines and defines alert type constants
- `src/contentScripts/codeMirror/alertIcons.ts` - Octicon SVG icons used in the inline title widget
- `src/contentScripts/codeMirror/alertColors.ts` - Light/dark theme color tokens used by the CM6 decorations
- `src/insertNoteAlertCommand.ts` - Registers global command that delegates to the CM6 extension

### Commands

- `markdownAlerts.insertNoteAlert`: Global command (accessible via menu/shortcut)
    - Executes `markdownAlerts.insertAlertOrToggle` via CM6 editor control to insert new alert, or toggle alert types on existing alerts (or convert block quote to alert).

## Design Principles

- Markdown Editor implementation uses styling (line decorations) and inline widgets (no heavy block widgets)
- Single detection path via `parseGitHubAlertTitleLine` with regex derived from `GITHUB_ALERT_TYPES`
- Consistent styling between editor and viewer (4px border, transparent backgrounds, matching colors, octicon SVGs)
