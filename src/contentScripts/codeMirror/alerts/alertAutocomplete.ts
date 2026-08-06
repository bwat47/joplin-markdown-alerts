import { type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { ChangeSet, EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';
import { getMarkdownAlertEditorSettings } from '../pluginSettings';

/** Matches alert autocomplete triggers, e.g. ">!no" or "> [!no". */
const AUTOCOMPLETE_TRIGGER_PATTERN = /^(\s*)(>!|> \[!)([a-zA-Z]*)$/;
const ALERT_TYPE_SORT_TEXT_WIDTH = String(GITHUB_ALERT_TYPES.length).length;

type AlertAutocompleteTriggerMatch = {
    triggerFrom: number;
    typeFrom: number;
};

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type MatchingAlertSelection = {
    selectionIndex: number;
    match: AlertAutocompleteTriggerMatch;
    change: TextChange;
};

function buildAlertInsertText(type: GitHubAlertType): string {
    return `> [!${type.toUpperCase()}] `;
}

function getAlertCompletionReplaceTo(state: EditorState, applyTo: number): number {
    let replaceTo = applyTo;
    const line = state.doc.lineAt(replaceTo);
    const suffix = line.text.slice(replaceTo - line.from);
    const remainingMarkerMatch = /^[a-zA-Z]*\]/.exec(suffix);

    if (remainingMarkerMatch) {
        replaceTo += remainingMarkerMatch[0].length;
    }

    const separatorSuffix = line.text.slice(replaceTo - line.from);
    const separatorEnd = separatorSuffix.search(/[^\t ]/);
    if (separatorEnd === -1) {
        replaceTo += separatorSuffix.length;
    } else if (separatorEnd > 0) {
        replaceTo += separatorEnd;
    }

    return replaceTo;
}

function matchAlertAutocompleteTrigger(state: EditorState, pos: number): AlertAutocompleteTriggerMatch | null {
    const line = state.doc.lineAt(pos);
    const linePrefix = line.text.slice(0, pos - line.from);
    const match = AUTOCOMPLETE_TRIGGER_PATTERN.exec(linePrefix);

    if (!match) return null;

    const triggerFrom = line.from + match[1].length;
    const typeFrom = triggerFrom + match[2].length;
    return { triggerFrom, typeFrom };
}

function sortChanges(changes: TextChange[]): TextChange[] {
    return [...changes].sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
}

/**
 * Builds the replacement for a single cursor, or null when that cursor is not
 * sitting on an alert autocomplete trigger.
 */
function matchSelectionForCompletion(
    state: EditorState,
    range: SelectionRange,
    selectionIndex: number,
    insertText: string,
    replaceToOverride: number | null
): MatchingAlertSelection | null {
    if (!range.empty) return null;

    const rangeMatch = matchAlertAutocompleteTrigger(state, range.head);
    if (!rangeMatch) return null;

    const replaceTo = getAlertCompletionReplaceTo(state, replaceToOverride ?? range.head);
    return {
        selectionIndex,
        match: rangeMatch,
        change: { from: rangeMatch.triggerFrom, to: replaceTo, insert: insertText },
    };
}

/** Collects the alert replacements for every cursor that sits on a trigger. */
function collectMatchingSelections(
    state: EditorState,
    insertText: string,
    completionPos: number,
    applyTo: number
): MatchingAlertSelection[] {
    const matchingSelections: MatchingAlertSelection[] = [];

    state.selection.ranges.forEach((range, selectionIndex) => {
        // The completion widget already resolved the replacement end for the cursor it
        // was opened on; other cursors resolve their own.
        const replaceToOverride = range.head === completionPos ? applyTo : null;
        const selection = matchSelectionForCompletion(state, range, selectionIndex, insertText, replaceToOverride);

        if (selection) matchingSelections.push(selection);
    });

    return matchingSelections;
}

/**
 * Maps every selection through the pending changes: replaced cursors land after the
 * inserted alert marker, untouched selections keep their (mapped) range.
 */
function buildSelectionRanges(
    state: EditorState,
    matchingSelections: MatchingAlertSelection[],
    changeSet: ChangeSet,
    insertText: string
): SelectionRange[] {
    const anchorsByIndex = new Map<number, number>();

    for (const { selectionIndex, match } of matchingSelections) {
        anchorsByIndex.set(selectionIndex, changeSet.mapPos(match.triggerFrom, -1) + insertText.length);
    }

    return state.selection.ranges.map((range, selectionIndex) => {
        const anchor = anchorsByIndex.get(selectionIndex);

        if (anchor !== undefined) {
            return EditorSelection.cursor(anchor);
        }

        return EditorSelection.range(changeSet.mapPos(range.anchor, 1), changeSet.mapPos(range.head, 1));
    });
}

/** Inserts the alert marker at every cursor that is on a trigger. */
function applyAlertCompletion(view: EditorView, insertText: string, completionPos: number, applyTo: number): void {
    const state = view.state;
    const matchingSelections = collectMatchingSelections(state, insertText, completionPos, applyTo);
    const sortedChanges = sortChanges(matchingSelections.map(({ change }) => change));
    const changeSet = ChangeSet.of(sortedChanges, state.doc.length);
    const selectionRanges = buildSelectionRanges(state, matchingSelections, changeSet, insertText);

    view.dispatch({
        changes: sortedChanges,
        selection: EditorSelection.create(selectionRanges, state.selection.mainIndex),
    });
}

export function createAlertCompletionSource(): CompletionSource {
    return (context: CompletionContext): CompletionResult | null => {
        if (!getMarkdownAlertEditorSettings(context.state).enableAlertAutocomplete) return null;

        const match = matchAlertAutocompleteTrigger(context.state, context.pos);

        if (!match) return null;

        return {
            from: match.typeFrom,
            to: context.pos,
            options: GITHUB_ALERT_TYPES.map((type, index) => {
                const label = type.charAt(0).toUpperCase() + type.slice(1);
                const insertText = buildAlertInsertText(type);
                return {
                    label,
                    sortText: String(index).padStart(ALERT_TYPE_SORT_TEXT_WIDTH, '0'),
                    type,
                    apply: (view, _completion, _applyFrom, applyTo) =>
                        applyAlertCompletion(view, insertText, context.pos, applyTo),
                };
            }),
            validFor: /^[a-zA-Z]*$/,
        };
    };
}
