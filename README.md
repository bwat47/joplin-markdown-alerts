# Markdown Alerts

A simple Joplin plugin that adds support for Github alert syntax in the Markdown Editor and Markdown viewer.

## Alert syntax

**Alerts**, also sometimes known as **callouts** or **admonitions**, are a Markdown extension based on the blockquote syntax that you can use to emphasize critical information: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts

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

The plugin will apply styling to block quotes containing github alert syntax. They will be similar to standard Joplin block quote styling, but with coloring based on the alert type. If you specify a title after the alert syntax in the first line of the block quote, only the title will be displayed when your cursor isn't on that line:

<img width="2154" height="1482" alt="screenshot1" src="https://github.com/user-attachments/assets/f117331b-bec2-4d4a-923d-060079d3ca65" />

A command to quickly create an alert is provided via an icon on the editing toolbar, keyboard shortcut (`Ctrl + Shift + A` by default), and an entry in the Edit menu. This will automatically insert `> [!NOTE] ` at the cursor position.

> [!Caution] Rich Text Editor
> Note that the Rich Text Editor is **not** supported. Alerts will (sort of) render in the Rich Text Editor, but editing the note in the Rich Text Editor will remove any github alert syntax.

## Markdown Viewer

Block quotes containing github alert syntax will be rendered as github style alerts in the markdown viewer using markdown-it-github-alerts:

<img width="2146" height="1704" alt="screenshot2" src="https://github.com/user-attachments/assets/96f84282-4caa-42d2-99ce-552176071360" />




