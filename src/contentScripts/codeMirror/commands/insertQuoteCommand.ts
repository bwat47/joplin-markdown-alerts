import type { EditorState, SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import {
    collectParagraphRanges,
    findParagraphNodeAt,
    getParagraphLineRange,
    getSyntaxTree,
    type ParagraphRange,
} from '../shared/syntaxTreeUtils';

const BLOCKQUOTE_PREFIX = '> ';
const BLOCKQUOTE_PREFIX_REGEX = /^>\s?/;

type LineRange = {
    from: number;
    to: number;
};

type MappedQuotePosition = {
    basePos: number;
    offset: number;
};

export function toggleBlockquoteText(text: string): string {
    return transformQuoteText(text, isBlockquoteText(text));
}

/**
 * Transforms one line for the quote toggle. Single source of truth for the
 * text changes and the selection mapping. Adding never nests: lines that
 * already carry a quote prefix are left unchanged, so mixed text (e.g. lazy
 * continuation lines inside a blockquote) normalizes to one quote level.
 */
function transformQuoteLine(lineText: string, removeQuotePrefix: boolean): string {
    if (removeQuotePrefix) {
        return lineText.replace(BLOCKQUOTE_PREFIX_REGEX, '');
    }

    return BLOCKQUOTE_PREFIX_REGEX.test(lineText) ? lineText : `${BLOCKQUOTE_PREFIX}${lineText}`;
}

function transformQuoteText(text: string, removeQuotePrefix: boolean): string {
    return text
        .split('\n')
        .map((line) => transformQuoteLine(line, removeQuotePrefix))
        .join('\n');
}

function isBlockquoteText(text: string): boolean {
    return text.split('\n').every((line) => BLOCKQUOTE_PREFIX_REGEX.test(line));
}

function mapPositionThroughQuoteTransform(
    state: EditorState,
    target: QuoteTarget,
    position: number,
    removeQuotePrefix: boolean
): MappedQuotePosition | null {
    if (position < target.range.from || position > target.range.to) {
        return null;
    }

    const targetText = target.text;
    const targetLine = state.doc.lineAt(position);
    const lineOffset = position - targetLine.from;
    const lines = targetText.split('\n');
    const startLineNo = state.doc.lineAt(target.range.from).number;
    const targetLineIndex = targetLine.number - startLineNo;

    if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
        return null;
    }

    let transformedOffset = 0;
    for (let index = 0; index < targetLineIndex; index += 1) {
        transformedOffset += transformQuoteLine(lines[index], removeQuotePrefix).length + 1;
    }

    // The transform only edits the start of a line, so the position keeps its
    // offset from the line end; clamp to line start for positions inside a
    // removed prefix.
    const targetLineText = lines[targetLineIndex];
    const lineDelta = transformQuoteLine(targetLineText, removeQuotePrefix).length - targetLineText.length;
    transformedOffset += Math.max(0, lineOffset + lineDelta);

    return {
        basePos: target.range.from,
        offset: transformedOffset,
    };
}

function findTargetContainingPosition(targets: QuoteTarget[], position: number): QuoteTarget | null {
    return targets.find((target) => position >= target.range.from && position <= target.range.to) ?? null;
}

function createExplicitQuoteSelection(
    state: EditorState,
    targets: QuoteTarget[],
    range: SelectionRange,
    removeQuotePrefix: boolean
): ExplicitCursorSelection | null {
    const anchorTarget = findTargetContainingPosition(targets, range.anchor);
    const headTarget = findTargetContainingPosition(targets, range.head);
    if (!anchorTarget || !headTarget) {
        return null;
    }

    const mappedAnchor = mapPositionThroughQuoteTransform(state, anchorTarget, range.anchor, removeQuotePrefix);
    const mappedHead = mapPositionThroughQuoteTransform(state, headTarget, range.head, removeQuotePrefix);
    if (!mappedAnchor || !mappedHead) {
        return null;
    }

    return {
        anchorBasePos: mappedAnchor.basePos,
        anchorOffset: mappedAnchor.offset,
        headBasePos: mappedHead.basePos,
        headOffset: mappedHead.offset,
    };
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

function addQuoteCursorTargets(
    state: EditorState,
    ranges: readonly SelectionRange[],
    targetMap: Map<string, QuoteTarget>,
    explicitSelectionsByIndex: Map<number, ExplicitCursorSelection>
): void {
    ranges.forEach((range, index) => {
        if (!range.empty) {
            return;
        }

        const cursorTarget = createQuoteCursorTarget(state, range.head);
        if (!targetMap.has(cursorTarget.key)) {
            targetMap.set(cursorTarget.key, cursorTarget);
        }
        if (cursorTarget.explicitSelection) {
            explicitSelectionsByIndex.set(index, cursorTarget.explicitSelection);
        }
    });
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

        if (nonEmptyRanges.length === 0) {
            const targetMap = new Map<string, QuoteTarget>();
            const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();

            addQuoteCursorTargets(state, ranges, targetMap, explicitSelectionsByIndex);

            const changes = Array.from(targetMap.values()).map(({ range, text }) => {
                return { from: range.from, to: range.to, insert: toggleBlockquoteText(text) };
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
        addQuoteCursorTargets(state, ranges, targetMap, explicitSelectionsByIndex);

        const rangeTexts = Array.from(targetMap.values()).sort((a, b) => a.range.from - b.range.from);

        if (rangeTexts.length === 0) {
            return false;
        }

        const allQuoted = rangeTexts.every((entry) => isBlockquoteText(entry.text));
        ranges.forEach((range, index) => {
            if (range.empty) {
                return;
            }

            const explicitSelection = createExplicitQuoteSelection(state, rangeTexts, range, allQuoted);
            if (explicitSelection) {
                explicitSelectionsByIndex.set(index, explicitSelection);
            }
        });

        const changes = rangeTexts
            .map(({ range, text }) => {
                const updated = transformQuoteText(text, allQuoted);
                if (updated === text) {
                    return null;
                }
                return { from: range.from, to: range.to, insert: updated };
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
