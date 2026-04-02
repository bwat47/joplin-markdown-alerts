> [!note]
> This plugin was created entirely with AI tools

# Markdown Alerts and Formatting Commands

A Joplin plugin that adds support for GitHub-style alerts (callouts) in the markdown editor/viewer, plus editor commands for alerts, blockquotes, and inline formatting commands for strikethrough/underline/superscript/subscript/highlight.

![example](https://github.com/user-attachments/assets/5cc62d52-9cd3-40f6-97bc-0bf2a51a83f7)

> [!CAUTION]
> Note that the Rich Text Editor is **not** supported. Alerts will (sort of) render in the Rich Text Editor, but editing the note in the Rich Text Editor will remove any github alert syntax.

## Alert syntax

**Alerts**, also sometimes known as **callouts** or **admonitions**, are a Markdown extension based on the blockquote syntax that you can use to emphasize critical information: [Github Alerts Documentation](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)

To add an alert, use a special blockquote line specifying the alert type, followed by the alert information in a standard blockquote. Five types of alerts are available:

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

> [!NOTE] Alert with a custom title
> This alert uses a custom title
```

## Markdown Editor

### Insert or Toggle alert

A command to quickly create an alert (or toggle alert types) is provided via an icon on the editing toolbar, keyboard shortcut (`Ctrl + Shift + A` by default), and an entry in the Edit menu. This command will either:

- On an empty line, insert a new alert (`> [!NOTE]`) and place the cursor after the marker.
- If the cursor is within an existing alert, toggle through the alert types (Note > Tip > Important > Warning > Caution).
- If the cursor is inside a regular blockquote, convert it into an alert.
- With no selection, (and cursor isn't inside an existing quote/alert), convert the current paragraph into an alert (or current line if no paragraph).
- If you have a selection, convert the selected paragraphs/lines into an alert (and toggle types if already an alert).

### Insert or Toggle blockquote

A command to quickly insert or toggle blockquotes is provided via an icon on the editing toolbar, keyboard shortcut (`Ctrl + Shift + .` by default), and an entry in the Edit Menu. This command will either:

- On an empty line, insert `> ` and place the cursor after the marker.
- With no selection, convert the current paragraph to a blockquote (or line if no paragraph).
- With a selection, convert all paragraphs/lines in the selection to blockquotes (paragraph-aware).

### Inline formatting commands

The plugin also adds toolbar and Edit menu commands for these inline formats (which joplin supports rendering, but doesn't provide commands for in the markdown editor):

- Highlight: `==text==` (`CmdOrCtrl + Shift + Y` by default)
- Strikethrough: `~~text~~` (`CmdOrCtrl + Shift + \`` by default)
- Underline: `++text++` (`CmdOrCtrl + Shift + U` by default)
- Superscript: `^text^` (no default shortcut)
- Subscript: `~text~` (no default shortcut)

These commands behave as follows:

- On an empty selection, insert the opening and closing delimiters and place the cursor between them.
- If the entire selection is already wrapped in the target format, remove that outer formatting.
- If the selection contains one or more complete spans already using the target format, remove only that target formatting and leave other markdown intact.
- If the target format is not present in the selection, wrap the full selection.
- For multiline full-line selections, format line by line instead of wrapping the entire block.
- For list lines, preserve structural markers such as blockquote prefixes, bullet/ordered list markers, and task checkboxes while formatting only the list item content.
- Blank lines are preserved when formatting multiline full-line selections.

## Github Alert Styling

The plugin will apply styling to block quotes containing github alert syntax in the markdown editor. They will be similar to standard Joplin block quote styling, but with coloring based on the alert type, and the line with the alert syntax will be rendered as a title.

### Markdown Viewer

Block quotes containing github alert syntax will be rendered as github style alerts in the markdown viewer using markdown-it-github-alerts.
