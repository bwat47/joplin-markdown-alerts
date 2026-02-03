import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import {
    collectParagraphRanges,
    findParagraphNodeAt,
    getParagraphLineRange,
    getProbePositions,
    getSyntaxTree,
    type ParagraphRange,
} from './syntaxTreeUtils';

const BLOCKQUOTE_PREFIX = '> ';
const BLOCKQUOTE_PREFIX_REGEX = /^>\s?/;

type LineRange = {
    from: number;
    to: number;
};

export function toggleBlockquoteText(text: string): string {
    const lines = text.split('\n');
    const allQuoted = lines.every((line) => BLOCKQUOTE_PREFIX_REGEX.test(line));

    if (allQuoted) {
        return removeBlockquotePrefix(text);
    }

    return addBlockquotePrefix(text);
}

function addBlockquotePrefix(text: string): string {
    return text
        .split('\n')
        .map((line) => `${BLOCKQUOTE_PREFIX}${line}`)
        .join('\n');
}

function removeBlockquotePrefix(text: string): string {
    return text
        .split('\n')
        .map((line) => line.replace(BLOCKQUOTE_PREFIX_REGEX, ''))
        .join('\n');
}

function isBlockquoteText(text: string): boolean {
    return text.split('\n').every((line) => BLOCKQUOTE_PREFIX_REGEX.test(line));
}

type NodeMatchPredicate = (node: SyntaxNode) => boolean;

function findNodeAtPositions(
    tree: ReturnType<typeof getSyntaxTree>,
    positions: number[],
    predicate: NodeMatchPredicate
): SyntaxNode | null {
    for (const position of positions) {
        let node: SyntaxNode | null = tree.resolveInner(position, -1);
        while (node) {
            if (predicate(node)) {
                return node;
            }
            node = node.parent;
        }
        node = tree.resolveInner(position, 1);
        while (node) {
            if (predicate(node)) {
                return node;
            }
            node = node.parent;
        }
    }
    return null;
}

function isPositionInBlockquote(state: EditorState, tree: ReturnType<typeof getSyntaxTree>, position: number): boolean {
    const positions = getProbePositions(state, position, BLOCKQUOTE_PREFIX_REGEX);
    return Boolean(findNodeAtPositions(tree, positions, (node) => node.name.toLowerCase() === 'blockquote'));
}

function collectNonParagraphLineRanges(
    state: EditorState,
    paragraphRanges: ParagraphRange[],
    selectionFrom: number,
    selectionTo: number
): LineRange[] {
    const doc = state.doc;
    const startLineNo = doc.lineAt(selectionFrom).number;
    const endLineNo = doc.lineAt(selectionTo).number;
    const paragraphLineNumbers = new Set<number>();

    for (const range of paragraphRanges) {
        const rangeStartLine = doc.lineAt(range.from).number;
        const rangeEndLine = doc.lineAt(range.to).number;
        for (let lineNo = rangeStartLine; lineNo <= rangeEndLine; lineNo += 1) {
            paragraphLineNumbers.add(lineNo);
        }
    }

    const ranges: LineRange[] = [];
    for (let lineNo = startLineNo; lineNo <= endLineNo; lineNo += 1) {
        if (paragraphLineNumbers.has(lineNo)) {
            continue;
        }
        const line = doc.line(lineNo);
        ranges.push({ from: line.from, to: line.to });
    }
    return ranges;
}

/**
 * Toggles blockquote formatting for the cursor or the selected ranges.
 * - Cursor only: toggles the current paragraph (or line if no paragraph) and inserts `> ` on an empty line.
 * - Selections: processes each selection independently, quoting paragraphs and any non-paragraph lines inside the selection; dedupes overlapping ranges.
 */
export function createQuoteSelectionCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);

        if (nonEmptyRanges.length === 0) {
            const cursorPos = state.selection.main.head;
            const cursorLine = state.doc.lineAt(cursorPos);
            if (cursorLine.text.trim() === '') {
                const insertionText = '> ';
                const selectionPos = cursorLine.from + insertionText.length;
                view.dispatch({
                    changes: {
                        from: cursorLine.from,
                        to: cursorLine.to,
                        insert: insertionText,
                    },
                    selection: EditorSelection.single(selectionPos),
                });
                return true;
            }
            const tree = getSyntaxTree(state, cursorPos);
            const paragraphNode = findParagraphNodeAt(state, tree, cursorPos, BLOCKQUOTE_PREFIX_REGEX);
            if (!paragraphNode) {
                const updated = isBlockquoteText(cursorLine.text)
                    ? removeBlockquotePrefix(cursorLine.text)
                    : addBlockquotePrefix(cursorLine.text);

                view.dispatch({
                    changes: {
                        from: cursorLine.from,
                        to: cursorLine.to,
                        insert: updated,
                    },
                });
                return true;
            }

            const paragraphRange = getParagraphLineRange(state, paragraphNode);
            const paragraphText = state.doc.sliceString(paragraphRange.from, paragraphRange.to);
            const updated = isPositionInBlockquote(state, tree, cursorPos)
                ? removeBlockquotePrefix(paragraphText)
                : addBlockquotePrefix(paragraphText);

            view.dispatch({
                changes: {
                    from: paragraphRange.from,
                    to: paragraphRange.to,
                    insert: updated,
                },
            });
            return true;
        }

        const paragraphRangeMap = new Map<string, ParagraphRange>();
        const nonParagraphLineRangeMap = new Map<string, LineRange>();

        for (const range of nonEmptyRanges) {
            const tree = getSyntaxTree(state, range.to);
            let paragraphRanges = collectParagraphRanges(state, tree, range.from, range.to);

            if (paragraphRanges.length === 0) {
                const paragraphNode = findParagraphNodeAt(state, tree, range.from, BLOCKQUOTE_PREFIX_REGEX);
                if (paragraphNode) {
                    paragraphRanges = [getParagraphLineRange(state, paragraphNode)];
                }
            }

            for (const paragraphRange of paragraphRanges) {
                const key = `${paragraphRange.from}:${paragraphRange.to}`;
                if (!paragraphRangeMap.has(key)) {
                    paragraphRangeMap.set(key, paragraphRange);
                }
            }

            const nonParagraphLineRanges = collectNonParagraphLineRanges(state, paragraphRanges, range.from, range.to);
            for (const nonParagraphRange of nonParagraphLineRanges) {
                const key = `${nonParagraphRange.from}:${nonParagraphRange.to}`;
                if (!nonParagraphLineRangeMap.has(key)) {
                    nonParagraphLineRangeMap.set(key, nonParagraphRange);
                }
            }
        }

        const paragraphRanges = Array.from(paragraphRangeMap.values()).sort((a, b) => a.from - b.from);
        const nonParagraphLineRanges = Array.from(nonParagraphLineRangeMap.values()).sort((a, b) => a.from - b.from);

        const rangeTexts = [
            ...paragraphRanges.map((range) => ({
                range,
                text: state.doc.sliceString(range.from, range.to),
            })),
            ...nonParagraphLineRanges.map((range) => ({
                range,
                text: state.doc.sliceString(range.from, range.to),
            })),
        ];

        if (rangeTexts.length === 0) {
            return false;
        }

        const allQuoted = rangeTexts.every((entry) => isBlockquoteText(entry.text));

        const changes = rangeTexts
            .map(({ range, text }) => {
                if (allQuoted) {
                    const updated = removeBlockquotePrefix(text);
                    if (updated === text) {
                        return null;
                    }
                    return { from: range.from, to: range.to, insert: updated };
                }

                if (!isBlockquoteText(text)) {
                    const updated = addBlockquotePrefix(text);
                    return { from: range.from, to: range.to, insert: updated };
                }

                return null;
            })
            .filter((change): change is { from: number; to: number; insert: string } => Boolean(change));

        if (changes.length === 0) {
            return false;
        }

        view.dispatch({ changes });
        return true;
    };
}
