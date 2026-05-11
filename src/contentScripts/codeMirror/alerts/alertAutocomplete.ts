import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

import { ALERT_COLORS } from './alertColors';
import { ALERT_ICONS } from './alertIcons';
import { GITHUB_ALERT_TYPES, type GitHubAlertType } from './alertParsing';

/** Matches alert autocomplete triggers, e.g. ">!no" or "> [!no". */
const AUTOCOMPLETE_TRIGGER_PATTERN = /^(\s*)(>!|> \[!)([a-zA-Z]*)$/;

function buildAlertInsertText(type: GitHubAlertType): string {
    return `> [!${type.toUpperCase()}] `;
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
        GITHUB_ALERT_TYPES.map((type) => [
            `.cm-completionIcon-${type}`,
            { backgroundColor: colors[type].color },
        ])
    );
    return [autocompleteBaseTheme, EditorView.theme(iconColorRules)];
}

export function createAlertCompletionSource(): CompletionSource {
    return (context: CompletionContext): CompletionResult | null => {
        const line = context.state.doc.lineAt(context.pos);
        const linePrefix = line.text.slice(0, context.pos - line.from);
        const match = AUTOCOMPLETE_TRIGGER_PATTERN.exec(linePrefix);

        if (!match) return null;

        // triggerFrom: position of the '>' character (start of the trigger)
        const triggerFrom = line.from + match[1].length;
        // typeFrom: position right after the trigger, where the user types the partial type name
        const typeFrom = triggerFrom + match[2].length;

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
                        const replaceTo =
                            view.state.sliceDoc(applyTo, applyTo + 1) === ']' ? applyTo + 1 : applyTo;
                        view.dispatch({
                            changes: { from: triggerFrom, to: replaceTo, insert: insertText },
                            selection: { anchor: triggerFrom + insertText.length },
                        });
                    },
                };
            }),
            validFor: /^[a-zA-Z]*$/,
        };
    };
}
