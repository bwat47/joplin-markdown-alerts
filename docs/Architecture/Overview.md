# Architecture overview

## Purpose

Markdown Alerts extends Joplin with GitHub-style alerts in the Markdown viewer and editor. It also provides Markdown editing commands for alerts, blockquotes, inline formatting, and clearing formatting.

The note's Markdown text is the source of truth. Viewer rendering and editor decorations provide two presentations of that text; editing commands change the text itself.

## Main components

The plugin integrates with Joplin through a main entry point and two content scripts:

| Component | Responsibility | Location |
| --- | --- | --- |
| Main plugin | Registers settings, commands, menus, toolbar buttons, and content scripts. Bridges Joplin's APIs and the editor integration. | `src/index.ts`, `src/settings.ts`, `src/joplinCommandRegistration.ts` |
| Viewer integration | Extends Joplin's Markdown rendering pipeline with alert HTML and theme-aware CSS, using `markdown-it-github-alerts`. | `src/contentScripts/markdownIt/` |
| Editor integration | Extends CodeMirror 6 with alert decorations, title widgets, autocomplete, and commands that modify Markdown. | `src/contentScripts/codeMirror/` |

The viewer and editor process the same note independently. Neither depends on the other's rendered output. They share alert types and icons to keep their presentation consistent.

## Interaction between components

At startup, the main plugin registers settings and user-facing commands, then loads the viewer and editor content scripts through Joplin.

When a user invokes a command through a menu, shortcut, or toolbar button, the main plugin forwards it to the active Markdown editor. The editor integration applies the change using the current document and selection. Command logic stays separate from alert rendering and autocomplete.

Settings are owned by the main plugin. The editor requests its settings through Joplin's content-script messaging API and holds them locally for its extensions. The viewer reads the relevant setting through Joplin's rendering API. Shared command definitions keep the main plugin's registrations aligned with the editor's implementations.

## Architectural boundaries

- **Joplin integration belongs in the main plugin.** Application-level registration and settings access are separate from document editing.
- **Rendering belongs to each host surface.** The viewer uses Markdown-it and CSS; the editor uses CodeMirror decorations and inline widgets while keeping the Markdown editable.
- **Document changes belong in editor commands.** Commands operate on Markdown and selections without depending on the viewer.
- **Editor support targets CodeMirror 6.** The editor content script skips installation when CodeMirror 6 is unavailable.
