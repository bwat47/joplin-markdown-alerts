import { type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { ChangeSet, EditorSelection, type EditorState } from '@codemirror/state';

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
                    apply: (view, _completion, _applyFrom, applyTo) => {
                        const state = view.state;
                        const matchingSelections = state.selection.ranges
                            .map<MatchingAlertSelection | null>((range, selectionIndex) => {
                                if (!range.empty) return null;

                                const rangeMatch = matchAlertAutocompleteTrigger(state, range.head);
                                if (!rangeMatch) return null;

                                const replaceTo = getAlertCompletionReplaceTo(
                                    state,
                                    range.head === context.pos ? applyTo : range.head
                                );
                                return {
                                    selectionIndex,
                                    match: rangeMatch,
                                    change: { from: rangeMatch.triggerFrom, to: replaceTo, insert: insertText },
                                };
                            })
                            .filter((selection): selection is MatchingAlertSelection => selection !== null);

                        const sortedChanges = sortChanges(matchingSelections.map(({ change }) => change));
                        const changeSet = ChangeSet.of(sortedChanges, state.doc.length);
                        const selectionAnchorsByIndex = new Map(
                            matchingSelections.map(({ selectionIndex, match }) => [
                                selectionIndex,
                                changeSet.mapPos(match.triggerFrom, -1) + insertText.length,
                            ])
                        );
                        const selectionRanges = state.selection.ranges.map((range, selectionIndex) => {
                            const anchor = selectionAnchorsByIndex.get(selectionIndex);

                            if (anchor !== undefined) {
                                return EditorSelection.cursor(anchor);
                            }

                            return EditorSelection.range(
                                changeSet.mapPos(range.anchor, 1),
                                changeSet.mapPos(range.head, 1)
                            );
                        });

                        view.dispatch({
                            changes: sortedChanges,
                            selection: EditorSelection.create(selectionRanges, state.selection.mainIndex),
                        });
                    },
                };
            }),
            validFor: /^[a-zA-Z]*$/,
        };
    };
}
