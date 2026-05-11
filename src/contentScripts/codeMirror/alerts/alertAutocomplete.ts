import {
    completionStatus,
    startCompletion,
    type CompletionContext,
    type CompletionResult,
    type CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

/** Matches alert autocomplete triggers, e.g. ">!no" or "> [!no". */
const AUTOCOMPLETE_TRIGGER_PATTERN = /^(\s*)(>!|> \[!)([a-zA-Z]*)$/;
const ALERT_TYPE_SORT_TEXT_WIDTH = String(GITHUB_ALERT_TYPES.length).length;

type AlertAutocompleteTriggerMatch = {
    triggerFrom: number;
    typeFrom: number;
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

    const separatorEnd = line.text.slice(replaceTo - line.from).search(/[^\t ]/);
    if (separatorEnd > 0) {
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

function isDeleteUpdate(update: ViewUpdate): boolean {
    return update.transactions.some((transaction) => transaction.isUserEvent('delete'));
}

export function createAlertCompletionSource(): CompletionSource {
    return (context: CompletionContext): CompletionResult | null => {
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
                        const replaceTo = getAlertCompletionReplaceTo(view.state, applyTo);
                        view.dispatch({
                            changes: { from: match.triggerFrom, to: replaceTo, insert: insertText },
                            selection: { anchor: match.triggerFrom + insertText.length },
                        });
                    },
                };
            }),
            validFor: /^[a-zA-Z]*$/,
        };
    };
}

export function createAlertAutocompleteBackspaceActivationExtension() {
    return ViewPlugin.fromClass(
        class {
            update(update: ViewUpdate) {
                if (!update.docChanged || !isDeleteUpdate(update) || completionStatus(update.state)) return;

                const selection = update.state.selection.main;
                if (!selection.empty || !matchAlertAutocompleteTrigger(update.state, selection.head)) return;

                setTimeout(() => {
                    const currentSelection = update.view.state.selection.main;
                    if (
                        completionStatus(update.view.state) ||
                        !currentSelection.empty ||
                        !matchAlertAutocompleteTrigger(update.view.state, currentSelection.head)
                    ) {
                        return;
                    }

                    startCompletion(update.view);
                }, 0);
            }
        }
    );
}
