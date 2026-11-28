import type { EditorState, Line, SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import type { InlineFormatDefinition } from '../../../inlineFormatCommands';
import { parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { changeOverlapsRange, rangesOverlap, type TextRange } from '../shared/commandRangeUtils';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import { getProbePositions, getSyntaxTree } from '../shared/syntaxTreeUtils';
import { createInlineFormatSegmentFinder, type InlineFormatSegmentFinder } from './inlineFormatSegmentFinder';
import {
    analyzeCursorAction,
    getDelimiterRanges,
    splitStructuralLineParts,
    wrapFullLineText,
    wrapSelectionText,
} from './inlineFormatText';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

/** Whether a command adds the target format or removes existing target spans. */
type InlineFormatMode = 'add' | 'remove';

type CursorPlan = {
    changes: TextChange[];
    selection: ExplicitCursorSelection;
};

/**
 * How one selected line is wrapped in `add` mode:
 * - `line`: text starts at the line boundary; structural prefixes stay outside the delimiters.
 * - `inline`: the selected text is wrapped as-is.
 * - `skip`: the text is left unchanged.
 */
type SelectedLineKind = 'line' | 'inline' | 'skip';

type SelectedLineEntry = TextRange & {
    text: string;
    kind: SelectedLineKind;
};

type SelectionPlan = {
    lineEntries: SelectedLineEntry[];
    /** Target-format segments the selection overlaps; `remove` mode deletes their delimiters. */
    segments: TextRange[];
};

/** Block structures whose lines are never wrapped by line-aware formatting. */
type SkippableBlockKind = 'code' | 'table' | 'horizontalRule';

const STRUCTURAL_PREFIX_PROBE_REGEX = /^[ \t]*(?:>\s*)*/;
const SKIPPABLE_BLOCK_KIND_BY_NODE_NAME = new Map<string, SkippableBlockKind>([
    ['FencedCode', 'code'],
    ['CodeBlock', 'code'],
    ['Table', 'table'],
    ['TableHeader', 'table'],
    ['TableRow', 'table'],
    ['TableCell', 'table'],
    ['TableDelimiter', 'table'],
    ['HorizontalRule', 'horizontalRule'],
]);

/** Walks up the syntax tree once per probe position, collecting the skippable blocks enclosing the line. */
function findEnclosingSkippableBlockKinds(view: EditorView, lineFrom: number): Set<SkippableBlockKind> {
    const state = view.state;
    const tree = getSyntaxTree(state, lineFrom);
    const kinds = new Set<SkippableBlockKind>();

    for (const probePosition of getProbePositions(state, lineFrom, STRUCTURAL_PREFIX_PROBE_REGEX)) {
        let node: SyntaxNode | null = tree.resolveInner(probePosition, 1);
        while (node) {
            const kind = SKIPPABLE_BLOCK_KIND_BY_NODE_NAME.get(node.name);
            if (kind) {
                kinds.add(kind);
            }
            node = node.parent;
        }
    }

    return kinds;
}

function tableLineHasCellDelimiters(line: string): boolean {
    const structuralParts = splitStructuralLineParts(line);
    const content = structuralParts ? structuralParts.content : line;
    return content.includes('|');
}

function isGitHubAlertTitleLine(line: string): boolean {
    return parseGitHubAlertTitleLine(line) !== null;
}

function lineCanUseLineAwareFormatting(view: EditorView, line: string, lineFrom: number): boolean {
    const blockKinds = findEnclosingSkippableBlockKinds(view, lineFrom);
    if (blockKinds.has('code') || blockKinds.has('horizontalRule')) {
        return false;
    }

    if (blockKinds.has('table') && tableLineHasCellDelimiters(line)) {
        return false;
    }

    return !isGitHubAlertTitleLine(line);
}

/**
 * Classifies a line's selected slice. A single-line partial selection is wrapped exactly as selected.
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
        const from = Math.max(range.from, docLine.from);
        const to = Math.min(range.to, docLine.to);

        entries.push({
            from,
            to,
            text: doc.sliceString(from, to),
            kind: classifySelectedLine(view, docLine, from - docLine.from, to - docLine.from, isMultiLineSelection),
        });
    }

    return entries;
}

function wrapSelectedLine({ text, kind }: SelectedLineEntry, format: InlineFormatDefinition): string {
    switch (kind) {
        case 'line':
            return wrapFullLineText(text, format);
        case 'inline':
            return wrapSelectionText(text, format);
        default:
            return text;
    }
}

/**
 * Collects the target segments a selection overlaps. A single-line selection uses the whole selection;
 * a multi-line selection only counts the lines it would format, so skipped lines (code, tables, alert
 * titles) are not modified. Segments may extend past the selection and across soft line breaks.
 */
function findOverlappedSegments(
    state: EditorState,
    range: SelectionRange,
    lineEntries: SelectedLineEntry[],
    findSegments: InlineFormatSegmentFinder
): TextRange[] {
    const targets = lineEntries.length > 1 ? lineEntries.filter(({ kind }) => kind !== 'skip') : [range];
    const segmentsByStart = new Map<number, TextRange>();

    for (const target of targets) {
        for (const segment of findSegments(state.doc.lineAt(target.from))) {
            if (rangesOverlap(segment, target)) {
                segmentsByStart.set(segment.from, segment);
            }
        }
    }

    return Array.from(segmentsByStart.values());
}

function planSelection(
    view: EditorView,
    range: SelectionRange,
    findSegments: InlineFormatSegmentFinder
): SelectionPlan {
    const lineEntries = getSelectedLineEntries(view, range);

    return {
        lineEntries,
        segments: findOverlappedSegments(view.state, range, lineEntries, findSegments),
    };
}

/**
 * Chooses one mode for every selection in the command: if any selection overlaps the target format,
 * all selections only remove it; otherwise all selections add it.
 */
function resolveFormattingMode(plans: SelectionPlan[]): InlineFormatMode {
    return plans.some(({ segments }) => segments.length > 0) ? 'remove' : 'add';
}

function createDelimiterDeletions(segments: readonly TextRange[], format: InlineFormatDefinition): TextChange[] {
    return segments.flatMap((segment) =>
        getDelimiterRanges(segment, format).map(({ from, to }) => ({ from, to, insert: '' }))
    );
}

function getSelectionChanges(
    plan: SelectionPlan,
    range: SelectionRange,
    format: InlineFormatDefinition,
    mode: InlineFormatMode
): TextChange[] {
    if (mode === 'remove') {
        return createDelimiterDeletions(plan.segments, format);
    }

    const selectedText = plan.lineEntries.map(({ text }) => text).join('\n');
    const updatedText = plan.lineEntries.map((entry) => wrapSelectedLine(entry, format)).join('\n');
    return updatedText === selectedText ? [] : [{ from: range.from, to: range.to, insert: updatedText }];
}

/** Selection positions are mapped through the command's changes with `assoc = -1`. */
function createExplicitSelection(anchor: number, head: number): ExplicitCursorSelection {
    return {
        anchorBasePos: anchor,
        anchorOffset: 0,
        headBasePos: head,
        headOffset: 0,
    };
}

function planCursor(
    state: EditorState,
    cursorPos: number,
    format: InlineFormatDefinition,
    findSegments: InlineFormatSegmentFinder,
    nonEmptyRanges: readonly SelectionRange[]
): CursorPlan | null {
    const action = analyzeCursorAction(findSegments(state.doc.lineAt(cursorPos)), cursorPos, format);

    if (action?.kind === 'move') {
        // An empty change keeps the command dispatching even though only the cursor moves.
        return {
            changes: [{ from: cursorPos, to: cursorPos, insert: '' }],
            selection: createExplicitSelection(action.position, action.position),
        };
    }

    if (action?.kind === 'unwrap') {
        const { segment } = action;
        return {
            changes: createDelimiterDeletions([segment], format),
            selection: createExplicitSelection(segment.from, segment.to - format.closingDelimiter.length),
        };
    }

    const insertion = {
        from: cursorPos,
        to: cursorPos,
        insert: `${format.openingDelimiter}${format.closingDelimiter}`,
    };
    if (nonEmptyRanges.some((range) => changeOverlapsRange(insertion, range))) {
        return null;
    }

    return {
        changes: [insertion],
        selection: {
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
 * removes the format across all of them. Cursors are handled independently. Removal deletes only the
 * delimiters of each overlapped segment, so identical deletions from several selections are merged.
 */
export function createInsertInlineFormatCommand(view: EditorView, format: InlineFormatDefinition): () => boolean {
    return () => {
        const state = view.state;
        const findSegments = createInlineFormatSegmentFinder(state, format);
        const changesByKey = new Map<string, TextChange>();
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
        const addChanges = (changes: TextChange[]) => {
            for (const change of changes) {
                changesByKey.set(`${change.from}:${change.to}:${change.insert}`, change);
            }
        };

        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);
        const plans = ranges.map((range) => (range.empty ? null : planSelection(view, range, findSegments)));
        const mode = resolveFormattingMode(plans.filter((plan): plan is SelectionPlan => plan !== null));

        ranges.forEach((range, index) => {
            const plan = plans[index];
            if (plan) {
                addChanges(getSelectionChanges(plan, range, format, mode));
                return;
            }

            const cursorPlan = planCursor(state, range.head, format, findSegments, nonEmptyRanges);
            if (cursorPlan) {
                addChanges(cursorPlan.changes);
                explicitSelectionsByIndex.set(index, cursorPlan.selection);
            }
        });

        const changes = Array.from(changesByKey.values());
        if (changes.length === 0) {
            return false;
        }

        dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
