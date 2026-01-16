import type { CodeMirrorControl } from 'api/types';

import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { isBlockQuoteLine, parseGitHubAlertTitleLine } from '../../alerts/githubAlert';

const alertsBaseTheme = EditorView.baseTheme({
    '.cm-line.cm-gh-alert': {
        borderLeft: '4px solid var(--cm-gh-alert-color)',
        paddingLeft: '8px',
        marginLeft: '0',
        backgroundColor: 'var(--cm-gh-alert-bg)',
    },
    '.cm-line.cm-gh-alert-title': {
        fontWeight: '600',
    },

    '.cm-line.cm-gh-alert.cm-gh-alert-note': {
        '--cm-gh-alert-color': '#0969da',
        '--cm-gh-alert-bg': 'rgba(9, 105, 218, 0.08)',
    },
    '.cm-line.cm-gh-alert.cm-gh-alert-tip': {
        '--cm-gh-alert-color': '#1a7f37',
        '--cm-gh-alert-bg': 'rgba(26, 127, 55, 0.08)',
    },
    '.cm-line.cm-gh-alert.cm-gh-alert-important': {
        '--cm-gh-alert-color': '#8250df',
        '--cm-gh-alert-bg': 'rgba(130, 80, 223, 0.08)',
    },
    '.cm-line.cm-gh-alert.cm-gh-alert-warning': {
        '--cm-gh-alert-color': '#9a6700',
        '--cm-gh-alert-bg': 'rgba(154, 103, 0, 0.10)',
    },
    '.cm-line.cm-gh-alert.cm-gh-alert-caution': {
        '--cm-gh-alert-color': '#d1242f',
        '--cm-gh-alert-bg': 'rgba(209, 36, 47, 0.08)',
    },
});

function computeDecorations(view: EditorView): DecorationSet {
    const doc = view.state.doc;

    let minFrom = view.viewport.from;
    let maxTo = view.viewport.to;
    for (const { from, to } of view.visibleRanges) {
        if (from < minFrom) minFrom = from;
        if (to > maxTo) maxTo = to;
    }

    const fromLine = doc.lineAt(minFrom).number;
    const toLine = doc.lineAt(maxTo).number;

    let scanFromLine = fromLine;
    while (scanFromLine > 1 && isBlockQuoteLine(doc.line(scanFromLine - 1).text)) {
        scanFromLine--;
    }

    let scanToLine = toLine;
    while (scanToLine < doc.lines && isBlockQuoteLine(doc.line(scanToLine + 1).text)) {
        scanToLine++;
    }

    const ranges: Range<Decoration>[] = [];

    let lineNo = scanFromLine;
    while (lineNo <= scanToLine) {
        const line = doc.line(lineNo);
        if (!isBlockQuoteLine(line.text)) {
            lineNo++;
            continue;
        }

        const isStartOfQuoteBlock = lineNo === 1 || !isBlockQuoteLine(doc.line(lineNo - 1).text);
        if (!isStartOfQuoteBlock) {
            lineNo++;
            continue;
        }

        let endLineNo = lineNo;
        while (endLineNo < doc.lines && isBlockQuoteLine(doc.line(endLineNo + 1).text)) {
            endLineNo++;
        }

        const title = parseGitHubAlertTitleLine(line.text);
        if (title) {
            for (let n = lineNo; n <= endLineNo; n++) {
                const currentLine = doc.line(n);
                const classes = ['cm-gh-alert', `cm-gh-alert-${title.type}`];
                if (n === lineNo) classes.push('cm-gh-alert-title');
                ranges.push(Decoration.line({ class: classes.join(' ') }).range(currentLine.from));
            }
        }

        lineNo = endLineNo + 1;
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
            if (update.docChanged || update.viewportChanged) {
                this.decorations = computeDecorations(update.view);
            }
        }
    },
    {
        decorations: (value) => value.decorations,
    }
);

export default function () {
    return {
        plugin: function (codeMirrorOrEditorControl: unknown) {
            if (!codeMirrorOrEditorControl || typeof codeMirrorOrEditorControl !== 'object') return;

            const editorControl = codeMirrorOrEditorControl as Partial<CodeMirrorControl>;
            if (typeof editorControl.addExtension !== 'function') return;

            editorControl.addExtension([alertsBaseTheme, alertsPlugin]);
        },
    };
}
