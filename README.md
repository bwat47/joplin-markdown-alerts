# Markdown Alerts and Formatting Commands

A Joplin plugin that adds the following functionality to the Markdown editor:

- renders GitHub-style alerts in the Markdown viewer and Markdown editor
- adds Markdown editor commands for alerts, blockquotes, and inline formatting (for markdown syntax that joplin's builtin formatting commands don't cover)

![example](https://github.com/user-attachments/assets/5cc62d52-9cd3-40f6-97bc-0bf2a51a83f7)

> [!NOTE]
> This plugin was created entirely with AI tools.

> [!CAUTION]
> The Rich Text Editor is not supported. Alerts may appear there, but editing in the Rich Text Editor will remove GitHub alert syntax.

## 1. GitHub Alert Rendering

The plugin supports GitHub-style alert syntax:

- Markdown viewer: alerts render as styled callouts
- Markdown editor: alerts are decorated as styled block quotes, with a title line showing the alert type (or custom title) and svg icon based on alert type

Supported alert types:

- `NOTE`
- `TIP`
- `IMPORTANT`
- `WARNING`
- `CAUTION`

Example:

```markdown
> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

> [!NOTE] Custom title
> This alert uses a custom title
```

### 2. Markdown Editor Commands For Block Structures

The plugin adds toolbar buttons and Edit menu commands for:

- Insert or Toggle alert
- Insert or Toggle blockquote

#### Insert or Toggle alert

Default shortcut: `Ctrl + Shift + A`

Behavior:

- On an empty line, insert `> [!NOTE] ` and place the cursor after the marker
- If the cursor is inside an existing alert, cycle the alert type
- If the cursor is inside a regular blockquote, convert it into an alert
- With no selection, convert the current paragraph or line into an alert
- With a selection, convert the selected paragraphs or lines into an alert

#### Insert or Toggle blockquote

Default shortcut: `Ctrl + Shift + .`

Behavior:

- On an empty line, insert `> ` and place the cursor after the marker
- With no selection, convert the current paragraph or line into a blockquote
- With a selection, convert the selected paragraphs or lines into blockquotes

## Inline Formatting Commands

Joplin supports various inline Markdown extensions, but the Markdown editor does not provide built-in commands for all of them. This plugin adds commands, toolbar buttons, and Edit menu entries for:

- Highlight: `==text==`
- Strikethrough: `~~text~~`
- Underline: `++text++`
- Superscript: `^text^`
- Subscript: `~text~`

Default shortcuts:

- Highlight: `CmdOrCtrl + Shift + Y`
- Strikethrough: `CmdOrCtrl + Shift + \``
- Underline: `CmdOrCtrl + Shift + U`
- Superscript: no default shortcut
- Subscript: no default shortcut

Command behavior:

- Empty selection: insert the delimiter pair and place the cursor between them
- Selected text already fully wrapped in the target format: remove the outer formatting
- Selection contains one or more inner spans already using the target format: remove only that target formatting
- Selection contains no target formatting: wrap the selection

For full-line selections, the inline formatting commands are line-aware instead of blindly wrapping the whole block:

- blank lines are preserved
- list markers are preserved
- blockquote markers are preserved
- heading markers are preserved
- task list markers are preserved
- fenced code blocks are left alone
- leading and trailing spaces stay outside newly inserted delimiters

Examples:

```markdown
> - abc test
```

Highlight becomes:

```markdown
> - ==abc test==
```

```markdown
## Heading
```

Highlight becomes:

```markdown
## ==Heading==
```
