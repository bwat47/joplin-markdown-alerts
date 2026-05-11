import {
    completionStatus,
    startCompletion,
    type CompletionContext,
    type CompletionResult,
    type CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
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

function createStandaloneSvg(svg: string): string {
    if (svg.includes('xmlns=')) return svg;

    return svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

function createIconDataUri(svg: string): string {
    return `url("data:image/svg+xml,${encodeURIComponent(createStandaloneSvg(svg))}")`;
}

const iconRules = Object.fromEntries(
    GITHUB_ALERT_TYPES.map((type) => [
        `.cm-completionIcon-${type}`,
        {
            maskImage: createIconDataUri(ALERT_ICONS[type]),
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: createIconDataUri(ALERT_ICONS[type]),
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
        },
    ])
);

const autocompleteBaseTheme = EditorView.baseTheme({
    // Higher specificity (4 classes) than CodeMirror's "& .cm-completionIcon" (2 classes),
    // which sets opacity:0.6, width:.8em, paddingRight:.6em, boxSizing:content-box.
    '& .cm-tooltip.cm-tooltip-autocomplete .cm-completionIcon': {
        width: '16px',
        height: '16px',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: '6px',
        marginLeft: '2px',
        paddingRight: '0',
        boxSizing: 'border-box',
        opacity: '1',
        flexShrink: '0',
    },
    ...iconRules,
});

export function createAlertAutocompleteTheme(isDark: boolean) {
    const colors = isDark ? ALERT_COLORS.dark : ALERT_COLORS.light;
    const iconColorRules = Object.fromEntries(
        GITHUB_ALERT_TYPES.map((type) => [`.cm-completionIcon-${type}`, { backgroundColor: colors[type].color }])
    );
    return [autocompleteBaseTheme, EditorView.theme(iconColorRules)];
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
