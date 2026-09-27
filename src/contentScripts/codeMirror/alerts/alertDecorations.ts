import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import {
    GITHUB_ALERT_TYPES,
    type GitHubAlertType,
    findBlockquoteMarkerOffsets,
    parseGitHubAlertTitleLine,
} from './alertParsing';
import { getMarkdownAlertEditorSettings } from '../pluginSettings';
import { getSyntaxTree } from '../shared/syntaxTreeUtils';

const BLOCKQUOTE_LINE_PATTERN = /^\s*>/;

const ALERT_LINE_PADDING_LEFT = '8px';

const quoteMarkDecoration = Decoration.mark({ class: 'cm-gh-alert-quote-mark' });

/** Base structural styles (no colors) */
const alertsBaseTheme = EditorView.baseTheme({
    '.cm-line.cm-gh-alert': {
        borderLeft: '4px solid var(--cm-gh-alert-color)',
        paddingLeft: ALERT_LINE_PADDING_LEFT,
        marginLeft: '0',
        backgroundColor: 'var(--cm-gh-alert-bg)',
        opacity: 1,
    },
    '.cm-line.cm-gh-alert.cm-gh-alert-no-bg': {
        backgroundColor: 'transparent',
    },
    '.cm-line.cm-gh-alert-title': {
        color: 'var(--cm-gh-alert-color)',
    },
    // Syntax highlighting (e.g. link styling on `[!NOTE]`) would otherwise override the title color
    // while the raw title syntax is visible.
    '.cm-line.cm-gh-alert-title *': {
        color: 'var(--cm-gh-alert-color)',
    },
    '.cm-gh-alert-quote-mark, .cm-gh-alert-quote-mark *': {
        color: 'var(--cm-gh-alert-color)',
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
    // Inline (not flex) so the title text shares the line's baseline with any visible `>` markers.
    // Only the rendered title is semibold; raw title syntax keeps the normal weight.
    '.cm-gh-alert-title-widget': {
        display: 'inline',
        fontWeight: '600',
    },
    // Hanging-indent extensions (e.g. Rich Markdown, Wrapped Line Indent) put a negative inline
    // text-indent on quote lines. text-indent is inherited, so reset it inside the widget to keep
    // its contents from shifting. The line's own padding/indent is left alone so the title stays
    // aligned with the body lines, which receive the same treatment.
    '.cm-gh-alert-title-widget, .cm-gh-alert-title-widget *': {
        textIndent: '0',
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
    const tree = getSyntaxTree(view.state, view.viewport.to);
    const { renderAlertTitles, showAlertBackground } = getMarkdownAlertEditorSettings(view.state);

    const findContiguousBlockquoteEndLineNo = (startLineNo: number, initialEndLineNo: number) => {
        let endLineNo = initialEndLineNo;

        while (endLineNo < doc.lines) {
            const nextLine = doc.line(endLineNo + 1);
            if (!BLOCKQUOTE_LINE_PATTERN.test(nextLine.text)) {
                break;
            }
            endLineNo += 1;
        }

        return Math.max(startLineNo, endLineNo);
    };

    const decorateBlockquote = (blockquoteFrom: number, blockquoteTo: number) => {
        const endPos = Math.max(blockquoteFrom, blockquoteTo - 1);
        const startLineNo = doc.lineAt(blockquoteFrom).number;
        const syntaxTreeEndLineNo = doc.lineAt(endPos).number;

        const titleLine = doc.line(startLineNo);
        const title = parseGitHubAlertTitleLine(titleLine.text);
        if (!title) return;

        const endLineNo = findContiguousBlockquoteEndLineNo(startLineNo, syntaxTreeEndLineNo);

        // Check if any selection range overlaps with the title line
        const isLineSelected = view.state.selection.ranges.some(
            (range) => range.from <= titleLine.to && range.to >= titleLine.from
        );

        if (renderAlertTitles && !isLineSelected) {
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
            if (!showAlertBackground) classes.push('cm-gh-alert-no-bg');
            ranges.push(Decoration.line({ class: classes.join(' ') }).range(currentLine.from));

            for (const offset of findBlockquoteMarkerOffsets(currentLine.text)) {
                const markerFrom = currentLine.from + offset;
                ranges.push(quoteMarkDecoration.range(markerFrom, markerFrom + 1));
            }
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
            const settingsChanged =
                getMarkdownAlertEditorSettings(update.startState) !== getMarkdownAlertEditorSettings(update.state);
            if (update.docChanged || update.viewportChanged || update.selectionSet || settingsChanged) {
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
