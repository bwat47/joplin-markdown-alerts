import type { Line, SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import type { InlineFormatDefinition } from '../../../inlineFormatCommands';
import { parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { changeOverlapsRange } from '../shared/commandRangeUtils';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import { getProbePositions, getSyntaxTree } from '../shared/syntaxTreeUtils';
import {
    analyzeSingleLineCursorAction,
    analyzeSingleLineSelectionRemoval,
    formatFullLineText,
    formatSelectionText,
    lineHasTargetFormatting,
    selectionTextHasTargetFormatting,
    splitStructuralLineParts,
    type InlineFormatMode,
    type SingleLineRelativeAction,
} from './inlineFormatSingleLineActions';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type FormattingAction = {
    key: string;
    change: TextChange;
    explicitSelection: ExplicitCursorSelection;
};

/**
 * How one selected line takes part in a formatting command:
 * - `line`: text starts at the line boundary; structural prefixes stay outside the delimiters.
 * - `inline`: the selected text is formatted as-is.
 * - `skip`: the text is left unchanged.
 */
type SelectedLineKind = 'line' | 'inline' | 'skip';

type SelectedLineEntry = {
    text: string;
    kind: SelectedLineKind;
};

type SelectionPlan = {
    /** Single-line removal that expands to cover target spans overlapping the selection, if any. */
    removal: FormattingAction | null;
    lineEntries: SelectedLineEntry[];
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

/**
 * Classifies a line's selected slice. A single-line partial selection is formatted exactly as selected.
 * Lines in a multi-line selection skip structures that inline delimiters would break (code, tables,
 * alert titles, horizontal rules), and partial edge slices that are whitespace-only are skipped.
 */
function classifySelectedLine(
    view: EditorView,
    docLine: Line,
    selectionStart: number,
    selectionEnd: number,
    isMultiLineSelection: boolean
): SelectedLineKind {
    const isFullySelected = selectionStart === 0 && selectionEnd === docLine.length;
    if (!isMultiLineSelection && !isFullySelected) {
        return 'inline';
    }

    if (!isFullySelected && docLine.text.slice(selectionStart, selectionEnd).trim() === '') {
        return 'skip';
    }

    if (!lineCanUseLineAwareFormatting(view, docLine.text, docLine.from)) {
        return 'skip';
    }

    return selectionStart === 0 ? 'line' : 'inline';
}

function getSelectedLineEntries(view: EditorView, range: SelectionRange): SelectedLineEntry[] {
    const doc = view.state.doc;
    const startLine = doc.lineAt(range.from);
    const endLine = doc.lineAt(range.to);
    const isMultiLineSelection = startLine.number !== endLine.number;
    const entries: SelectedLineEntry[] = [];

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
        const docLine = doc.line(lineNumber);
        const selectionStart = Math.max(range.from, docLine.from) - docLine.from;
        const selectionEnd = Math.min(range.to, docLine.to) - docLine.from;

        entries.push({
            text: docLine.text.slice(selectionStart, selectionEnd),
            kind: classifySelectedLine(view, docLine, selectionStart, selectionEnd, isMultiLineSelection),
        });
    }

    return entries;
}

function selectedLineHasTargetFormatting({ text, kind }: SelectedLineEntry, format: InlineFormatDefinition): boolean {
    switch (kind) {
        case 'line':
            return lineHasTargetFormatting(text, format);
        case 'inline':
            return selectionTextHasTargetFormatting(text, format);
        default:
            return false;
    }
}

function formatSelectedLine(
    { text, kind }: SelectedLineEntry,
    format: InlineFormatDefinition,
    mode: InlineFormatMode
): string {
    switch (kind) {
        case 'line':
            return formatFullLineText(text, format, mode);
        case 'inline':
            return formatSelectionText(text, format, mode);
        default:
            return text;
    }
}

function planSelection(view: EditorView, range: SelectionRange, format: InlineFormatDefinition): SelectionPlan {
    return {
        removal: findSelectionFormattingAction(view, range, format),
        lineEntries: getSelectedLineEntries(view, range),
    };
}

/**
 * Chooses one mode for every selection in the command: if any selection contains or overlaps the target
 * format, all selections only remove it; otherwise all selections add it.
 */
function resolveFormattingMode(plans: SelectionPlan[], format: InlineFormatDefinition): InlineFormatMode {
    const hasTargetFormatting = plans.some(
        ({ removal, lineEntries }) =>
            removal !== null || lineEntries.some((entry) => selectedLineHasTargetFormatting(entry, format))
    );

    return hasTargetFormatting ? 'remove' : 'add';
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
): FormattingAction | null {
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

function buildCursorActionKey(
    kind: SingleLineRelativeAction['kind'],
    cursorPos: number,
    docChangeFrom: number,
    docChangeTo: number
): string {
    switch (kind) {
        case 'cursor-jump-in':
            return `jump-in:${cursorPos}`;
        case 'cursor-jump-out':
            return `jump:${cursorPos}`;
        default:
            return `removal:${docChangeFrom}:${docChangeTo}`;
    }
}

function findCursorFormattingAction(
    view: EditorView,
    cursorPos: number,
    format: InlineFormatDefinition
): FormattingAction | null {
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
    const key = buildCursorActionKey(action.kind, cursorPos, docChangeFrom, docChangeTo);

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

function createCursorInsertion(cursorPos: number, format: InlineFormatDefinition): FormattingAction {
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

/**
 * Creates an inline-format command that supports multiple selections, cursor insertion, and
 * list-aware multiline full-line formatting.
 *
 * Non-empty selections share one mode (see `resolveFormattingMode`), so the command either adds or
 * removes the format across all of them. Cursors are handled independently.
 */
export function createInsertInlineFormatCommand(view: EditorView, format: InlineFormatDefinition): () => boolean {
    return () => {
        const state = view.state;
        const changeMap = new Map<string, TextChange>();
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);
        const plans = ranges.map((range) => (range.empty ? null : planSelection(view, range, format)));
        const mode = resolveFormattingMode(
            plans.filter((plan): plan is SelectionPlan => plan !== null),
            format
        );

        ranges.forEach((range, index) => {
            const plan = plans[index];
            if (!plan) {
                const removal = findCursorFormattingAction(view, range.head, format);
                if (removal) {
                    if (!changeMap.has(removal.key)) {
                        changeMap.set(removal.key, removal.change);
                    }
                    explicitSelectionsByIndex.set(index, removal.explicitSelection);
                    return;
                }

                const cursorInsertion = createCursorInsertion(range.head, format);
                if (
                    nonEmptyRanges.some((nonEmptyRange) => changeOverlapsRange(cursorInsertion.change, nonEmptyRange))
                ) {
                    return;
                }

                if (!changeMap.has(cursorInsertion.key)) {
                    changeMap.set(cursorInsertion.key, cursorInsertion.change);
                }
                explicitSelectionsByIndex.set(index, cursorInsertion.explicitSelection);
                return;
            }

            // A removal only exists when the selection overlaps the target format, which implies `remove` mode.
            if (plan.removal) {
                if (!changeMap.has(plan.removal.key)) {
                    changeMap.set(plan.removal.key, plan.removal.change);
                }
                explicitSelectionsByIndex.set(index, plan.removal.explicitSelection);
                return;
            }

            const selectedText = plan.lineEntries.map(({ text }) => text).join('\n');
            const updatedText = plan.lineEntries.map((entry) => formatSelectedLine(entry, format, mode)).join('\n');

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
