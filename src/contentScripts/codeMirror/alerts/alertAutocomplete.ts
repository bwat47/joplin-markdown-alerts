import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

/** Matches lines where >! starts an alert trigger, e.g. ">!", "  >!no" */
const AUTOCOMPLETE_TRIGGER_PATTERN = /^(\s*)(>!)([a-zA-Z]*)$/;

function buildAlertInsertText(type: GitHubAlertType): string {
    return `> [!${type.toUpperCase()}] `;
}

function createIconDataUri(svg: string): string {
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const iconRules = Object.fromEntries(
    GITHUB_ALERT_TYPES.map((type) => [
        `.cm-completionIcon-${type}`,
        {
            backgroundImage: createIconDataUri(ALERT_ICONS[type]),
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
        },
    ])
);

export const alertAutocompleteTheme = EditorView.baseTheme({
    '.cm-tooltip.cm-tooltip-autocomplete': {
        border: '1px solid rgba(127, 127, 127, 0.3)',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    },
    '.cm-completionIcon': {
        width: '16px',
        height: '16px',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: '6px',
        marginLeft: '2px',
        flexShrink: '0',
    },
    ...iconRules,
});

export function createAlertCompletionSource(): CompletionSource {
    return (context: CompletionContext): CompletionResult | null => {
        const line = context.state.doc.lineAt(context.pos);
        const linePrefix = line.text.slice(0, context.pos - line.from);
        const match = AUTOCOMPLETE_TRIGGER_PATTERN.exec(linePrefix);

        if (!match) return null;

        // triggerFrom: position of the '>' character (start of '>!')
        const triggerFrom = line.from + match[1].length;
        // typeFrom: position right after '>!', where the user types the partial type name
        const typeFrom = triggerFrom + 2;

        return {
            from: typeFrom,
            to: context.pos,
            options: GITHUB_ALERT_TYPES.map((type) => {
                const label = type.charAt(0).toUpperCase() + type.slice(1);
                const insertText = buildAlertInsertText(type);
                return {
                    label,
                    type,
                    apply: (view, _completion, _applyFrom, applyTo) => {
                        view.dispatch({
                            changes: { from: triggerFrom, to: applyTo, insert: insertText },
                            selection: { anchor: triggerFrom + insertText.length },
                        });
                    },
                };
            }),
            validFor: /^[a-zA-Z]*$/,
        };
    };
}
