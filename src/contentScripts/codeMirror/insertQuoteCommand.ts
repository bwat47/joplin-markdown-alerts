import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from './commandSelectionUtils';
import {
    collectParagraphRanges,
    findParagraphNodeAt,
    getParagraphLineRange,
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

type QuoteTarget = {
    key: string;
    range: LineRange | ParagraphRange;
    text: string;
    explicitSelection?: ExplicitCursorSelection;
};

function createQuoteCursorTarget(state: EditorState, cursorPos: number): QuoteTarget {
    const cursorLine = state.doc.lineAt(cursorPos);
    if (cursorLine.text.trim() === '') {
        return {
            key: `line:${cursorLine.from}:${cursorLine.to}`,
            range: {
                from: cursorLine.from,
                to: cursorLine.to,
            },
            text: '',
            explicitSelection: {
                anchorBasePos: cursorLine.from,
                anchorOffset: BLOCKQUOTE_PREFIX.length,
                headBasePos: cursorLine.from,
                headOffset: BLOCKQUOTE_PREFIX.length,
            },
        };
    }

    const tree = getSyntaxTree(state, cursorPos);
    const paragraphNode = findParagraphNodeAt(state, tree, cursorPos, BLOCKQUOTE_PREFIX_REGEX);
    if (!paragraphNode) {
        return {
            key: `line:${cursorLine.from}:${cursorLine.to}`,
            range: {
                from: cursorLine.from,
                to: cursorLine.to,
            },
            text: cursorLine.text,
        };
    }

    const paragraphRange = getParagraphLineRange(state, paragraphNode);
    const paragraphText = state.doc.sliceString(paragraphRange.from, paragraphRange.to);

    return {
        key: `paragraph:${paragraphRange.from}:${paragraphRange.to}`,
        range: {
            from: paragraphRange.from,
            to: paragraphRange.to,
        },
        text: paragraphText,
    };
}

/**
 * Toggles blockquote formatting for the cursor or the selected ranges.
 * - Cursor only: toggles the current paragraph (or line if no paragraph) and inserts `> ` on an empty line.
 * - Selections: processes each selection independently, quoting paragraphs and any non-paragraph lines inside the selection; dedupes overlapping ranges.
 */
export function createInsertQuoteCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);
        const emptyRanges = ranges.filter((range) => range.empty);

        if (nonEmptyRanges.length === 0) {
            const targetMap = new Map<string, QuoteTarget>();
            const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();

            ranges.forEach((range, index) => {
                const cursorTarget = createQuoteCursorTarget(state, range.head);
                if (!targetMap.has(cursorTarget.key)) {
                    targetMap.set(cursorTarget.key, cursorTarget);
                }
                if (cursorTarget.explicitSelection) {
                    explicitSelectionsByIndex.set(index, cursorTarget.explicitSelection);
                }
            });

            const changes = Array.from(targetMap.values()).map(({ range, text }) => {
                const updated = isBlockquoteText(text) ? removeBlockquotePrefix(text) : addBlockquotePrefix(text);
                return { from: range.from, to: range.to, insert: updated };
            });

            dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
            view.focus();
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

        const targetMap = new Map<string, QuoteTarget>();

        [...paragraphRanges, ...nonParagraphLineRanges]
            .sort((a, b) => a.from - b.from)
            .forEach((range) => {
                const key = `${range.from}:${range.to}`;
                targetMap.set(key, {
                    key,
                    range,
                    text: state.doc.sliceString(range.from, range.to),
                });
            });

        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
        emptyRanges.forEach((range, index) => {
            const cursorTarget = createQuoteCursorTarget(state, range.head);
            if (!targetMap.has(cursorTarget.key)) {
                targetMap.set(cursorTarget.key, cursorTarget);
            }
            if (cursorTarget.explicitSelection) {
                explicitSelectionsByIndex.set(nonEmptyRanges.length + index, cursorTarget.explicitSelection);
            }
        });

        const rangeTexts = Array.from(targetMap.values()).sort((a, b) => a.range.from - b.range.from);

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

        dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
