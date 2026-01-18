# Architecture overview (internal)

## Goal

Render GitHub-style Markdown alerts in both Joplin's viewer and CodeMirror 6 editor.

GitHub alert syntax:

```md
> [!note]
> This is a test alert
```

## Architecture

### Shared Module

- `src/alerts/alertColors.ts` - Light/dark theme colors used by both viewer and editor
- `src/alerts/alertParsing.ts` - Shared parsing logic (`parseGitHubAlertTitleLine`) and alert type constants

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
- Implements "clean titles": hides `[!TYPE]` marker and replaces it with a styled label unless the line is selected
- Theme detection via `EditorView.darkTheme` facet at plugin initialization
- Applies appropriate color theme based on detected theme

**Files:**

- `src/contentScripts/codeMirror/alertDecorations.ts` - CM6 extension with theme detection
- `src/insertNoteAlertCommand.ts` - Registers global command that delegates to CM6 extension

### Commands

- `markdownAlerts.insertNoteAlert`: Global command (accessible via menu/shortcut)
    - Executes `markdownAlerts.insertAlertOrToggle` via CM6 editor control to insert new alert, or toggle alert types on existing alerts (or convert block quote to alert).

## Design Principles

- Editor uses styling/text hiding and inline widgets (no heavy block widgets)
- Single detection path via `parseGitHubAlertTitleLine` with regex derived from `GITHUB_ALERT_TYPES`
- Consistent styling between editor and viewer (4px border, transparent backgrounds, matching colors)
