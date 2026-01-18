import type { CodeMirrorControl } from 'api/types';

import { ensureSyntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

import { ALERT_COLORS } from '../../alerts/alertColors';
import { GITHUB_ALERT_TYPES, type GitHubAlertType, parseGitHubAlertTitleLine } from '../../alerts/alertParsing';

const SYNTAX_TREE_TIMEOUT = 100;

/** Base structural styles (no colors) */
const alertsBaseTheme = EditorView.baseTheme({
    '.cm-line.cm-gh-alert': {
        borderLeft: '4px solid var(--cm-gh-alert-color)',
        paddingLeft: '8px',
        marginLeft: '0',
        backgroundColor: 'var(--cm-gh-alert-bg)',
        opacity: 1,
    },
    '.cm-line.cm-gh-alert-title': {
        fontWeight: '600',
        color: 'var(--cm-gh-alert-color)',
    },
});

/** Generate color theme rules for a given theme mode */
function buildColorTheme(isDark: boolean) {
    const colors = isDark ? ALERT_COLORS.dark : ALERT_COLORS.light;
    const rules: Record<string, Record<string, string>> = {};

    for (const type of GITHUB_ALERT_TYPES) {
        const { color, bg } = colors[type as GitHubAlertType];
        rules[`&.cm-gh-alert-${type}`] = {
            '--cm-gh-alert-color': color,
            '--cm-gh-alert-bg': bg,
        };
    }

    return EditorView.theme({ '.cm-line.cm-gh-alert': rules });
}

function computeDecorations(view: EditorView): DecorationSet {
    const doc = view.state.doc;
    const ranges: Range<Decoration>[] = [];
    const seenBlockquotes = new Set<string>();
    const cursorLineNo = doc.lineAt(view.state.selection.main.head).number;

    const tree = ensureSyntaxTree(view.state, view.viewport.to, SYNTAX_TREE_TIMEOUT);
    if (!tree) return Decoration.set([], true);

    const decorateBlockquote = (blockquoteFrom: number, blockquoteTo: number) => {
        const endPos = Math.max(blockquoteFrom, blockquoteTo - 1);
        const startLineNo = doc.lineAt(blockquoteFrom).number;
        const endLineNo = doc.lineAt(endPos).number;

        const titleLine = doc.line(startLineNo);
        const title = parseGitHubAlertTitleLine(titleLine.text);
        if (!title) return;

        if (cursorLineNo !== startLineNo) {
            if ('title' in title) {
                ranges.push(
                    Decoration.replace({}).range(
                        titleLine.from + title.markerHideRange.from,
                        titleLine.from + title.markerHideRange.to
                    )
                );
            } else {
                const typeText = title.type.charAt(0).toUpperCase() + title.type.slice(1);
                ranges.push(
                    Decoration.replace({
                        widget: new AlertTitleWidget(typeText),
                    }).range(titleLine.from + title.markerRange.from, titleLine.from + title.markerRange.to)
                );
            }
        }

        for (let n = startLineNo; n <= endLineNo; n++) {
            const currentLine = doc.line(n);
            const classes = ['cm-gh-alert', `cm-gh-alert-${title.type}`];
            if (n === startLineNo) classes.push('cm-gh-alert-title');
            ranges.push(Decoration.line({ class: classes.join(' ') }).range(currentLine.from));
        }
    };

    for (const { from, to } of view.visibleRanges) {
        tree.iterate({
            from,
            to,
            enter: (node) => {
                if (node.name.toLowerCase() !== 'blockquote') return;
                const key = `${node.from}:${node.to}`;
                if (seenBlockquotes.has(key)) return;
                seenBlockquotes.add(key);
                decorateBlockquote(node.from, node.to);
            },
        });
    }

    return Decoration.set(ranges, true);
}

const alertsPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = computeDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = computeDecorations(update.view);
            }
        }
    },
    {
        decorations: (value) => value.decorations,
    }
);

class AlertTitleWidget extends WidgetType {
    constructor(private readonly text: string) {
        super();
    }

    eq(other: AlertTitleWidget) {
        return other.text === this.text;
    }

    toDOM() {
        const span = document.createElement('span');
        span.textContent = this.text;
        return span;
    }

    ignoreEvent() {
        return false;
    }
}

export default function () {
    return {
        plugin: function (codeMirrorOrEditorControl: unknown) {
            if (!codeMirrorOrEditorControl || typeof codeMirrorOrEditorControl !== 'object') return;

            const editorControl = codeMirrorOrEditorControl as Partial<CodeMirrorControl>;
            if (typeof editorControl.addExtension !== 'function') return;

            // Detect dark theme from the editor state
            const editor = editorControl.editor;
            const isDarkTheme = editor?.state?.facet(EditorView.darkTheme) ?? false;
            const colorTheme = buildColorTheme(isDarkTheme);

            editorControl.addExtension([alertsBaseTheme, colorTheme, alertsPlugin]);
        },
    };
}
