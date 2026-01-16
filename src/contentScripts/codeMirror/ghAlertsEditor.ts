import type { CodeMirrorControl } from 'api/types';

import type { EditorState, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { parseGitHubAlertTitleLine } from '../../alerts/githubAlert';

declare const require: (moduleName: string) => unknown;

type SyntaxNodeRef = { name: string; from: number; to: number };

type SyntaxTree = {
    iterate: (spec: { from: number; to: number; enter: (node: SyntaxNodeRef) => void }) => void;
};

type EnsureSyntaxTree = (state: EditorState, upto: number, timeout: number) => SyntaxTree | null;

const SYNTAX_TREE_TIMEOUT = 100;

function isNonNullObject(value: unknown): value is Record<string, unknown> {
    return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

function getEnsureSyntaxTree(moduleValue: unknown): EnsureSyntaxTree | null {
    if (!isNonNullObject(moduleValue)) return null;
    const candidate = moduleValue['ensureSyntaxTree'];
    if (typeof candidate !== 'function') return null;
    return candidate as unknown as EnsureSyntaxTree;
}

function loadEnsureSyntaxTree(): EnsureSyntaxTree | null {
    try {
        return getEnsureSyntaxTree(require('@codemirror/language'));
    } catch {
        return null;
    }
}

const ensureSyntaxTree = loadEnsureSyntaxTree();

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
    if (!ensureSyntaxTree) {
        return Decoration.set([], true);
    }

    const doc = view.state.doc;

    let minFrom = view.viewport.from;
    let maxTo = view.viewport.to;
    for (const { from, to } of view.visibleRanges) {
        if (from < minFrom) minFrom = from;
        if (to > maxTo) maxTo = to;
    }

    const ranges: Range<Decoration>[] = [];
    const seenBlockquotes = new Set<string>();

    const tree = ensureSyntaxTree(view.state, maxTo, SYNTAX_TREE_TIMEOUT);
    if (!tree) return Decoration.set([], true);

    const decorateBlockquote = (blockquoteFrom: number, blockquoteTo: number) => {
        const endPos = Math.max(blockquoteFrom, blockquoteTo - 1);
        const startLineNo = doc.lineAt(blockquoteFrom).number;
        const endLineNo = doc.lineAt(endPos).number;

        const titleLine = doc.line(startLineNo);
        const title = parseGitHubAlertTitleLine(titleLine.text);
        if (!title) return;

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
