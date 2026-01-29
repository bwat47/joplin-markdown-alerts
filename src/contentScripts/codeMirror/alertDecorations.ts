import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType, parseGitHubAlertTitleLine } from './alertParsing';

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
        textIndent: '0 !important',
        paddingLeft: '1px !important',
    },
    '.cm-gh-alert-icon': {
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '0.5rem',
        verticalAlign: 'middle',
    },
    '.cm-gh-alert-icon svg': {
        fill: 'currentColor',
    },
    '.cm-gh-alert-title-widget': {
        display: 'inline-flex',
        alignItems: 'center',
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
    let tree = ensureSyntaxTree(view.state, view.viewport.to, SYNTAX_TREE_TIMEOUT);
    if (!tree) {
        tree = syntaxTree(view.state);
    }

    const decorateBlockquote = (blockquoteFrom: number, blockquoteTo: number) => {
        const endPos = Math.max(blockquoteFrom, blockquoteTo - 1);
        const startLineNo = doc.lineAt(blockquoteFrom).number;
        const endLineNo = doc.lineAt(endPos).number;

        const titleLine = doc.line(startLineNo);
        const title = parseGitHubAlertTitleLine(titleLine.text);
        if (!title) return;

        // Check if any selection range overlaps with the title line
        const isLineSelected = view.state.selection.ranges.some(
            (range) => range.from <= titleLine.to && range.to >= titleLine.from
        );

        if (!isLineSelected) {
            if ('title' in title) {
                // Custom title: replace marker + title with icon + custom title widget
                ranges.push(
                    Decoration.replace({
                        widget: new AlertTitleWidget(title.type, title.title),
                    }).range(titleLine.from + title.markerRange.from, titleLine.to)
                );
            } else {
                // Default title: replace marker with icon + capitalized type name
                const typeText = title.type.charAt(0).toUpperCase() + title.type.slice(1);
                ranges.push(
                    Decoration.replace({
                        widget: new AlertTitleWidget(title.type, typeText),
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
    constructor(
        private readonly type: GitHubAlertType,
        private readonly text: string
    ) {
        super();
    }

    eq(other: AlertTitleWidget) {
        return other.type === this.type && other.text === this.text;
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-gh-alert-title-widget';
        span.innerHTML = `<span class="cm-gh-alert-icon">${ALERT_ICONS[this.type]}</span>${this.escapeHtml(this.text)}`;
        return span;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    ignoreEvent() {
        return false;
    }
}

/**
 * Creates the CodeMirror extensions for rendering GitHub-style alert decorations.
 *
 * @param isDarkTheme - Whether to use dark theme colors
 * @returns Array of CodeMirror extensions
 */
export function createAlertDecorationExtensions(isDarkTheme: boolean): Extension[] {
    const colorTheme = buildColorTheme(isDarkTheme);
    return [alertsBaseTheme, colorTheme, alertsPlugin];
}
