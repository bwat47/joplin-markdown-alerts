# joplin-markdown-alerts (internal)

## Goal

Render GitHub-style Markdown alerts in both:

- Joplin’s Markdown viewer (renderer / preview)
- Joplin’s CodeMirror 6 editor (markdown source editor)

GitHub alert syntax example:

```md
> [!note]
> This is a test alert
```

## Architecture

### Viewer (Markdown viewer / renderer)

- Implemented as a Joplin `MarkdownItPlugin` content script.
- Uses `markdown-it-github-alerts` to transform block quotes into alert HTML.
- Loads CSS assets (`ghAlerts.css` + a light/dark theme variables file) via the content script `assets()` hook.
- Theme detection reads `--joplin-appearance` and gracefully falls back if `window.top` is not accessible (cross-origin / `file://` iframe).

Files:

- `src/index.ts` registers the MarkdownIt content script.
- `src/contentScripts/markdownIt/ghAlerts.ts` wires `markdown-it-github-alerts` into the renderer.
- `src/contentScripts/markdownIt/ghAlerts.css` styles `.markdown-alert` output from the library.
- `src/contentScripts/markdownIt/ghAlerts-theme-*.css` define color variables per theme.

### Editor (CodeMirror 6)

- Implemented as a Joplin `CodeMirrorPlugin` content script.
- Uses CodeMirror 6 line decorations (not block widgets) so the markdown source remains visible and editable.
- Detects alert blocks by using the CM6 syntax tree (`ensureSyntaxTree`) to find real Markdown blockquotes, then checking the first line for `> [!TYPE]` with GitHub default types only.
- Applies line classes per alert type with `Decoration.line(...)` and styling via `EditorView.baseTheme`.
- Uses standard CodeMirror 6 imports (`@codemirror/view`, `@codemirror/state`) and installs the extension via `editorControl.addExtension(...)`.
- If the content script is invoked in a non-CM6 editor context (no `addExtension`), it no-ops.

Files:

- `src/index.ts` registers the CodeMirror content script.
- `src/contentScripts/codeMirror/ghAlertsEditor.ts` installs the CM6 extension + theme.
- `src/alerts/githubAlert.ts` contains parsing helpers shared by the editor integration.

## Design notes

- Keep editor rendering "light-touch": style only, no text hiding or source replacement.
- Keep a single detection path for alert blocks (`parseGitHubAlertTitleLine`).
- Current editor styling uses GitHub-like colors with transparent backgrounds
