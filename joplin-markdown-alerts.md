# joplin-markdown-alerts (internal)

## Goal

Render GitHub-style Markdown alerts in both Joplin's viewer and CodeMirror 6 editor.

GitHub alert syntax:

```md
> [!note]
> This is a test alert
```

## Architecture

### Shared Module

- `src/alerts/alertColors.ts` - Single source of truth for light/dark theme colors used by both viewer and editor
- `src/alerts/githubAlert.ts` - Shared parsing logic (`parseGitHubAlertTitleLine`) and alert type constants

### Viewer (Markdown Renderer)

- Joplin `MarkdownItPlugin` content script using `markdown-it-github-alerts` library
- CSS assets loaded via content script `assets()` hook
- Theme detection via `--joplin-appearance` CSS variable with fallback for cross-origin iframes

**Files:**

- `src/contentScripts/markdownIt/ghAlerts.ts` - Plugin integration
- `src/contentScripts/markdownIt/ghAlerts.css` - Alert styles with transparent backgrounds
- `src/contentScripts/markdownIt/ghAlerts-theme-*.css` - Theme-specific color variables

### Editor (CodeMirror 6)

- Joplin `CodeMirrorPlugin` content script using line decorations (keeps source visible/editable)
- Detects alert blocks via CM6 syntax tree: finds blockquotes, validates first line matches `> [!TYPE]`
- Theme detection via `EditorView.darkTheme` facet at plugin initialization
- Applies appropriate color theme based on detected theme

**Files:**

- `src/contentScripts/codeMirror/ghAlertsEditor.ts` - CM6 extension with theme detection

## Design Principles

- Editor uses styling only (no text hiding or replacement)
- Single detection path via `parseGitHubAlertTitleLine` with regex derived from `GITHUB_ALERT_TYPES`
- Consistent styling between editor and viewer (4px border, transparent backgrounds, matching colors)
