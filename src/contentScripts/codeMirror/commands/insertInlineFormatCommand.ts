import type { SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { type InlineFormatDefinition } from '../../../inlineFormatCommands';
import {
    analyzeSingleLineCursorAction,
    analyzeSingleLineSelectionRemoval,
    applyInlineFormattingToSelectionText,
    formatFullLineText,
    lineHasTargetFormatting,
    splitStructuralLineParts,
} from './inlineFormatSingleLineActions';
import { parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import { getProbePositions, getSyntaxTree } from '../shared/syntaxTreeUtils';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type SelectedLineEntry = {
    line: string;
    lineFrom: number;
    isFullySelected: boolean;
    isEligibleForLineAwareFormatting: boolean;
};

const STRUCTURAL_PREFIX_PROBE_REGEX = /^[ \t]*(?:>\s*)*/;
const CODE_BLOCK_NODE_NAMES = new Set(['fencedcode', 'codeblock']);
const TABLE_NODE_NAMES = new Set(['table', 'tableheader', 'tablerow', 'tablecell', 'tabledelimiter']);
const HORIZONTAL_RULE_NODE_NAMES = new Set(['horizontalrule']);

function isLineInsideSyntaxNodes(view: EditorView, lineFrom: number, nodeNames: ReadonlySet<string>): boolean {
    const state = view.state;
    const tree = getSyntaxTree(state, lineFrom);

    for (const probePosition of getProbePositions(state, lineFrom, STRUCTURAL_PREFIX_PROBE_REGEX)) {
        let node: SyntaxNode | null = tree.resolveInner(probePosition, 1);
        while (node) {
            if (nodeNames.has(node.name.toLowerCase())) {
                return true;
            }
            node = node.parent;
        }
    }

    return false;
}

function isLineInsideCodeBlock(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, CODE_BLOCK_NODE_NAMES);
}

function isLineInsideMarkdownTable(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, TABLE_NODE_NAMES);
}

function isLineHorizontalRule(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, HORIZONTAL_RULE_NODE_NAMES);
}

function shouldSkipMarkdownTableLine(line: string, view: EditorView, lineFrom: number): boolean {
    if (!isLineInsideMarkdownTable(view, lineFrom)) {
        return false;
    }

    const structuralParts = splitStructuralLineParts(line);
    const content = structuralParts ? structuralParts.content : line;
    return content.includes('|');
}

function isGitHubAlertTitleLine(line: string): boolean {
    return parseGitHubAlertTitleLine(line) !== null;
}

function lineCanUseLineAwareFormatting(view: EditorView, line: string, lineFrom: number): boolean {
    return !(
        isLineInsideCodeBlock(view, lineFrom) ||
        shouldSkipMarkdownTableLine(line, view, lineFrom) ||
        isGitHubAlertTitleLine(line) ||
        isLineHorizontalRule(view, lineFrom)
    );
}

function getSelectedLineEntries(view: EditorView, range: SelectionRange): SelectedLineEntry[] {
    const state = view.state;
    const startLine = state.doc.lineAt(range.from);
    const selectedText = state.doc.sliceString(range.from, range.to);
    const lines = selectedText.split('\n');

    return lines.map((line, index) => {
        const docLine = state.doc.line(startLine.number + index);
        const lineFrom = docLine.from;
        const selectionStart = index === 0 ? range.from - lineFrom : 0;
        const selectionEnd = index === lines.length - 1 ? range.to - lineFrom : docLine.length;
        const isFullySelected = selectionStart === 0 && selectionEnd === docLine.length;

        return {
            line,
            lineFrom,
            isFullySelected,
            isEligibleForLineAwareFormatting: lineCanUseLineAwareFormatting(view, line, lineFrom),
        };
    });
}

function applyInlineFormattingToFullLineSelectionRange(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): string {
    const lineEntries = getSelectedLineEntries(view, range);
    const removalOnly = lineEntries.some(
        ({ line, isEligibleForLineAwareFormatting }) =>
            isEligibleForLineAwareFormatting && lineHasTargetFormatting(line, format)
    );

    return lineEntries
        .map(({ line, isEligibleForLineAwareFormatting }) => {
            if (!isEligibleForLineAwareFormatting) {
                return line;
            }

            return formatFullLineText(line, format, removalOnly);
        })
        .join('\n');
}

function isFullLineSelection(view: EditorView, range: SelectionRange): boolean {
    if (range.empty) {
        return false;
    }

    const state = view.state;
    const startLine = state.doc.lineAt(range.from);
    if (range.from !== startLine.from) {
        return false;
    }

    if (range.to === state.doc.length) {
        return true;
    }

    const lineAtEnd = state.doc.lineAt(range.to);
    return range.to === lineAtEnd.from || range.to === lineAtEnd.to;
}

function applyInlineFormattingToSelectionRange(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): string {
    const state = view.state;
    const selectedText = state.doc.sliceString(range.from, range.to);

    if (isFullLineSelection(view, range)) {
        return applyInlineFormattingToFullLineSelectionRange(view, range, format);
    }

    if (!selectedText.includes('\n')) {
        return applyInlineFormattingToSelectionText(selectedText, format);
    }

    const lineEntries = getSelectedLineEntries(view, range);
    const removalOnly = lineEntries
        .filter(({ isFullySelected, isEligibleForLineAwareFormatting }) => {
            return isFullySelected && isEligibleForLineAwareFormatting;
        })
        .some(({ line }) => lineHasTargetFormatting(line, format));

    return lineEntries
        .map(({ line, isFullySelected, isEligibleForLineAwareFormatting }) => {
            if (!isFullySelected) {
                return applyInlineFormattingToSelectionText(line, format);
            }

            if (!isEligibleForLineAwareFormatting) {
                return line;
            }

            return formatFullLineText(line, format, removalOnly);
        })
        .join('\n');
}

function createExplicitSelection(anchorPos: number, headPos: number, basePos: number): ExplicitCursorSelection {
    return {
        anchorBasePos: basePos,
        anchorOffset: anchorPos - basePos,
        headBasePos: basePos,
        headOffset: headPos - basePos,
    };
}

function findSelectionFormattingAction(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } | null {
    if (range.empty) {
        return null;
    }

    const state = view.state;
    const selectedText = state.doc.sliceString(range.from, range.to);
    if (selectedText.includes('\n')) {
        return null;
    }

    const line = state.doc.lineAt(range.from);
    const action = analyzeSingleLineSelectionRemoval(
        line.text,
        {
            from: range.from - line.from,
            to: range.to - line.from,
            anchor: range.anchor - line.from,
            head: range.head - line.from,
        },
        format
    );
    if (!action) {
        return null;
    }

    const docExpandedFrom = line.from + action.replaceFrom;
    const docExpandedTo = line.from + action.replaceTo;
    const mappedAnchor = line.from + action.nextAnchor;
    const mappedHead = line.from + action.nextHead;

    return {
        key: `selection-removal:${docExpandedFrom}:${docExpandedTo}`,
        change: {
            from: docExpandedFrom,
            to: docExpandedTo,
            insert: action.insert,
        },
        explicitSelection: createExplicitSelection(mappedAnchor, mappedHead, line.from + action.selectionBase),
    };
}

function findCursorFormattingAction(
    view: EditorView,
    cursorPos: number,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } | null {
    const state = view.state;
    const line = state.doc.lineAt(cursorPos);
    const action = analyzeSingleLineCursorAction(line.text, cursorPos - line.from, format);
    if (!action) {
        return null;
    }

    const docChangeFrom = line.from + action.replaceFrom;
    const docChangeTo = line.from + action.replaceTo;
    const absoluteAnchor = line.from + action.nextAnchor;
    const absoluteHead = line.from + action.nextHead;
    const key =
        action.kind === 'cursor-jump-in'
            ? `jump-in:${cursorPos}`
            : action.kind === 'cursor-jump-out'
              ? `jump:${cursorPos}`
              : `removal:${docChangeFrom}:${docChangeTo}`;

    return {
        key,
        change: {
            from: docChangeFrom,
            to: docChangeTo,
            insert: action.insert,
        },
        explicitSelection: createExplicitSelection(absoluteAnchor, absoluteHead, line.from + action.selectionBase),
    };
}

function createCursorInsertion(
    cursorPos: number,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } {
    const insertedText = `${format.openingDelimiter}${format.closingDelimiter}`;

    return {
        key: `cursor:${cursorPos}`,
        change: {
            from: cursorPos,
            to: cursorPos,
            insert: insertedText,
        },
        explicitSelection: {
            anchorBasePos: cursorPos,
            anchorOffset: format.openingDelimiter.length,
            headBasePos: cursorPos,
            headOffset: format.openingDelimiter.length,
        },
    };
}

function overlapsRange(change: TextChange, range: SelectionRange): boolean {
    if (change.from === change.to) {
        return change.from >= range.from && change.from <= range.to;
    }

    return change.from < range.to && change.to > range.from;
}

/**
 * Creates an inline-format command that supports multiple selections, cursor insertion, and
 * list-aware multiline full-line formatting.
 */
export function createInsertInlineFormatCommand(view: EditorView, format: InlineFormatDefinition): () => boolean {
    return () => {
        const state = view.state;
        const changeMap = new Map<string, TextChange>();
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
        const nonEmptyRanges = state.selection.ranges.filter((range) => !range.empty);

        state.selection.ranges.forEach((range, index) => {
            if (range.empty) {
                const removal = findCursorFormattingAction(view, range.head, format);
                if (removal) {
                    if (!changeMap.has(removal.key)) {
                        changeMap.set(removal.key, removal.change);
                    }
                    explicitSelectionsByIndex.set(index, removal.explicitSelection);
                    return;
                }

                const cursorInsertion = createCursorInsertion(range.head, format);
                if (nonEmptyRanges.some((nonEmptyRange) => overlapsRange(cursorInsertion.change, nonEmptyRange))) {
                    return;
                }

                if (!changeMap.has(cursorInsertion.key)) {
                    changeMap.set(cursorInsertion.key, cursorInsertion.change);
                }
                explicitSelectionsByIndex.set(index, cursorInsertion.explicitSelection);
                return;
            }

            const selectionRemoval = findSelectionFormattingAction(view, range, format);
            if (selectionRemoval) {
                if (!changeMap.has(selectionRemoval.key)) {
                    changeMap.set(selectionRemoval.key, selectionRemoval.change);
                }
                explicitSelectionsByIndex.set(index, selectionRemoval.explicitSelection);
                return;
            }

            const selectedText = state.doc.sliceString(range.from, range.to);
            const updatedText = applyInlineFormattingToSelectionRange(view, range, format);

            if (updatedText === selectedText) {
                return;
            }

            changeMap.set(`selection:${range.from}:${range.to}`, {
                from: range.from,
                to: range.to,
                insert: updatedText,
            });
        });

        const changes = Array.from(changeMap.values());
        if (changes.length === 0) {
            return false;
        }

        dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
