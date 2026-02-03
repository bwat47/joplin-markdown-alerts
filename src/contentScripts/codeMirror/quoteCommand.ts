import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

const BLOCKQUOTE_PREFIX = '> ';
const BLOCKQUOTE_PREFIX_REGEX = /^>\s?/;
const SYNTAX_TREE_TIMEOUT = 100;

type ParagraphRange = {
    from: number;
    to: number;
};

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

function getSyntaxTree(state: EditorState, position: number) {
    let tree = ensureSyntaxTree(state, position, SYNTAX_TREE_TIMEOUT);
    if (!tree) {
        tree = syntaxTree(state);
    }
    return tree;
}

type NodeMatchPredicate = (node: SyntaxNode) => boolean;

function findNodeAtPositions(
    tree: ReturnType<typeof syntaxTree>,
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

const BLOCKQUOTE_LINE_PREFIX = /^>\s?/;

function clampPositions(state: EditorState, positions: number[]): number[] {
    const max = Math.max(0, state.doc.length);
    return positions
        .map((pos) => Math.min(Math.max(pos, 0), max))
        .filter((pos, index, list) => list.indexOf(pos) === index);
}

function getProbePositions(state: EditorState, position: number): number[] {
    const line = state.doc.lineAt(position);
    const positions = [position, position - 1, position + 1];
    const match = BLOCKQUOTE_LINE_PREFIX.exec(line.text);
    if (match) {
        const afterPrefix = line.from + match[0].length;
        positions.push(afterPrefix);
        positions.push(afterPrefix + 1);
    }
    return clampPositions(state, positions);
}

function findParagraphNodeAt(state: EditorState, tree: ReturnType<typeof syntaxTree>, position: number): SyntaxNode | null {
    const positions = getProbePositions(state, position);
    return findNodeAtPositions(tree, positions, (node) => node.name.toLowerCase() === 'paragraph');
}

function isPositionInBlockquote(state: EditorState, tree: ReturnType<typeof syntaxTree>, position: number): boolean {
    const positions = getProbePositions(state, position);
    return Boolean(findNodeAtPositions(tree, positions, (node) => node.name.toLowerCase() === 'blockquote'));
}

type NodeRange = { from: number; to: number };

function getParagraphLineRange(state: EditorState, node: NodeRange): ParagraphRange {
    const startLine = state.doc.lineAt(node.from);
    const endPos = Math.max(node.from, node.to - 1);
    const endLine = state.doc.lineAt(endPos);
    return { from: startLine.from, to: endLine.to };
}

function collectParagraphRanges(state: EditorState, from: number, to: number): ParagraphRange[] {
    const tree = getSyntaxTree(state, to);
    const ranges: ParagraphRange[] = [];
    const seen = new Set<string>();

    tree.iterate({
        from,
        to,
        enter: (node: SyntaxNodeRef) => {
            if (node.name.toLowerCase() !== 'paragraph') {
                return;
            }
            const paragraphRange = getParagraphLineRange(state, node);
            const key = `${paragraphRange.from}:${paragraphRange.to}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            ranges.push(paragraphRange);
        },
    });

    return ranges.sort((a, b) => a.from - b.from);
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

export function createQuoteSelectionCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);

        if (nonEmptyRanges.length === 0) {
            const cursorPos = state.selection.main.head;
            const cursorLine = state.doc.lineAt(cursorPos);
            if (cursorLine.text.trim() === '') {
                view.dispatch(view.state.replaceSelection('> '));
                return true;
            }
            const tree = getSyntaxTree(state, cursorPos);
            const paragraphNode = findParagraphNodeAt(state, tree, cursorPos);
            if (!paragraphNode) {
                view.dispatch(view.state.replaceSelection('> '));
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
        for (const range of nonEmptyRanges) {
            for (const paragraphRange of collectParagraphRanges(state, range.from, range.to)) {
                const key = `${paragraphRange.from}:${paragraphRange.to}`;
                if (!paragraphRangeMap.has(key)) {
                    paragraphRangeMap.set(key, paragraphRange);
                }
            }
        }
        const paragraphRanges = Array.from(paragraphRangeMap.values()).sort((a, b) => a.from - b.from);

        if (paragraphRanges.length === 0) {
            return false;
        }

        const selectionFrom = Math.min(...nonEmptyRanges.map((range) => range.from));
        const selectionTo = Math.max(...nonEmptyRanges.map((range) => range.to));
        const nonParagraphLineRanges = collectNonParagraphLineRanges(
            state,
            paragraphRanges,
            selectionFrom,
            selectionTo
        );

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
