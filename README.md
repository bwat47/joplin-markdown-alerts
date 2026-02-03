> [!note]
> This plugin was created entirely with AI tools

# Markdown Alerts

A simple Joplin plugin that adds support for Github alert syntax in the Markdown Editor and Markdown Viewer.

![example](https://github.com/user-attachments/assets/610816cb-f90f-42ff-8ece-bb8734c2a4a3)

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

- Insert a new alert (`> [!NOTE]`) at the cursor positon (if not inside a block quote)
- Or, if inside a block quote will toggle through the different alert types (Note > Tip > Important > Warning > Caution).
- Or, if you have a text selection it will convert the text to a `[!note]` alert (or toggle through alert types if selected text is already a quote or an alert).

### Quote/Unquote selected text

A command to quickly Quote or Unquote selected text is provided via an icon on the editing toolbar, keyboard shortcut (`Ctrl + Shift + .` by default), and an entry in the Edit Menu.

The plugin will apply styling to block quotes containing github alert syntax. They will be similar to standard Joplin block quote styling, but with coloring based on the alert type, and the line with the alert syntax will be rendered as a title.

## Markdown Viewer

Block quotes containing github alert syntax will be rendered as github style alerts in the markdown viewer using markdown-it-github-alerts.
