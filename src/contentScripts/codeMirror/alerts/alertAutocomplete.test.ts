/** @jest-environment jsdom */
import { type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createEditorHarness } from '../shared/testUtils';
import { createAlertCompletionSource } from './alertAutocomplete';
import { GITHUB_ALERT_TYPES } from './alertParsing';
import { createMarkdownAlertEditorSettingsExtension } from '../pluginSettings';

function makeContext(view: EditorView, pos: number): CompletionContext {
    return {
        state: view.state,
        pos,
        explicit: false,
        matchBefore: () => null,
    } as unknown as CompletionContext;
}

function createAutocompleteEnabledHarness(input: string) {
    return createEditorHarness(input, {
        extensions: [
            createMarkdownAlertEditorSettingsExtension({
                enableAlertAutocomplete: true,
            }),
        ],
    });
}

function getCompletions(input: string): CompletionResult | null {
    const harness = createAutocompleteEnabledHarness(input);
    try {
        const source = createAlertCompletionSource();
        return source(makeContext(harness.view, harness.getCursor())) as CompletionResult | null;
    } finally {
        harness.destroy();
    }
}

describe('createAlertCompletionSource — trigger conditions', () => {
    test('returns null when line does not start with >!', () => {
        expect(getCompletions('hello|')).toBeNull();
    });

    test('returns null when >! is not at start of line', () => {
        expect(getCompletions('hello >!|')).toBeNull();
    });

    test('returns null for "> !" (space between)', () => {
        expect(getCompletions('> !|')).toBeNull();
    });

    test('returns null for ">>!" (double >>)', () => {
        expect(getCompletions('>>!|')).toBeNull();
    });

    test('returns null when trailing space follows >!', () => {
        expect(getCompletions('>! |')).toBeNull();
    });

    test('returns results for bare >! at start of line', () => {
        expect(getCompletions('>!|')).not.toBeNull();
    });

    test('returns results for >! with leading whitespace', () => {
        expect(getCompletions('   >!|')).not.toBeNull();
    });

    test('returns results for >! with partial type prefix', () => {
        expect(getCompletions('>!no|')).not.toBeNull();
    });

    test('returns results for full alert syntax prefix', () => {
        expect(getCompletions('> [!|')).not.toBeNull();
    });

    test('returns results for full alert syntax prefix with partial type prefix', () => {
        expect(getCompletions('> [!no|')).not.toBeNull();
    });

    test('returns results for full alert syntax prefix before an existing closing bracket', () => {
        expect(getCompletions('> [!n|]')).not.toBeNull();
    });

    test('returns results for mixed-case partial prefix', () => {
        expect(getCompletions('>!NoTe|')).not.toBeNull();
    });

    test('returns null when alert autocomplete is disabled', () => {
        const harness = createEditorHarness('>!|', {
            extensions: [
                createMarkdownAlertEditorSettingsExtension({
                    enableAlertAutocomplete: false,
                }),
            ],
        });

        try {
            const source = createAlertCompletionSource();
            expect(source(makeContext(harness.view, harness.getCursor()))).toBeNull();
        } finally {
            harness.destroy();
        }
    });
});

describe('createAlertCompletionSource — result shape', () => {
    test('options list contains all alert types', () => {
        const result = getCompletions('>!|')!;
        expect(result.options).toHaveLength(GITHUB_ALERT_TYPES.length);
    });

    test('each option label is the capitalized type name', () => {
        const result = getCompletions('>!|')!;
        const labels = result.options.map((o) => o.label);
        const expected = GITHUB_ALERT_TYPES.map((t) => t.charAt(0).toUpperCase() + t.slice(1));
        expect(labels).toEqual(expected);
    });

    test('each option type matches the alert type for icon lookup', () => {
        const result = getCompletions('>!|')!;
        result.options.forEach((o, i) => {
            expect(o.type).toBe(GITHUB_ALERT_TYPES[i]);
        });
    });

    test('each option sort text follows the alert toggle order', () => {
        const result = getCompletions('>!|')!;
        const sortText = result.options.map((o) => o.sortText);
        expect(sortText).toEqual(GITHUB_ALERT_TYPES.map((_type, index) => String(index).padStart(2, '0')));
    });

    test('from is positioned right after ">!" (past any leading whitespace)', () => {
        // Input:  "   >!|"  (3 spaces, then >!, cursor at end)
        // Expected from: 3 + 2 = 5 (after the leading spaces and ">!")
        const harness = createAutocompleteEnabledHarness('   >!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(5); // 3 spaces + ">!" = 5
        } finally {
            harness.destroy();
        }
    });

    test('from is 2 (after ">!") with no leading whitespace', () => {
        const harness = createAutocompleteEnabledHarness('>!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(2);
        } finally {
            harness.destroy();
        }
    });

    test('from is positioned right after "> [!" for full alert syntax prefix', () => {
        const harness = createAutocompleteEnabledHarness('> [!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(4);
        } finally {
            harness.destroy();
        }
    });

    test('to stays at the cursor when an auto-paired closing bracket follows', () => {
        const harness = createAutocompleteEnabledHarness('> [!|]');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.to).toBe(4);
        } finally {
            harness.destroy();
        }
    });

    test('validFor accepts a partial type continuation', () => {
        const result = getCompletions('>!|')!;
        const validFor = result.validFor as RegExp;
        expect(validFor.test('no')).toBe(true);
        expect(validFor.test('note')).toBe(true);
        expect(validFor.test('')).toBe(true);
    });

    test('validFor rejects text that should dismiss the dropdown', () => {
        const result = getCompletions('>!|')!;
        const validFor = result.validFor as RegExp;
        expect(validFor.test(' ')).toBe(false);
        expect(validFor.test('no ')).toBe(false);
    });
});

describe('createAlertCompletionSource — apply', () => {
    function applyCompletion(input: string, typeIndex: number): { text: string; cursor: number } {
        const harness = createAutocompleteEnabledHarness(input);
        try {
            const source = createAlertCompletionSource();
            const cursorPos = harness.getCursor();
            const result = source(makeContext(harness.view, cursorPos)) as CompletionResult;
            const option = result.options[typeIndex];
            const applyFn = option.apply as (
                view: EditorView,
                completion: (typeof result.options)[0],
                from: number,
                to: number
            ) => void;
            applyFn(harness.view, option, result.from, result.to ?? cursorPos);
            return { text: harness.getText(), cursor: harness.getCursor() };
        } finally {
            harness.destroy();
        }
    }

    test('replaces >! with the full alert syntax (note = index 0)', () => {
        const { text } = applyCompletion('>!|', 0);
        expect(text).toBe('> [!NOTE] ');
    });

    test('replaces >!partial with the full alert syntax', () => {
        const { text } = applyCompletion('>!no|', 0);
        expect(text).toBe('> [!NOTE] ');
    });

    test('completes full alert syntax prefix without duplicating the marker', () => {
        const { text } = applyCompletion('> [!no|', 0);
        expect(text).toBe('> [!NOTE] ');
    });

    test('replaces auto-paired closing bracket when completing full alert syntax prefix', () => {
        const { text } = applyCompletion('> [!|]', 0);
        expect(text).toBe('> [!NOTE] ');
    });

    test('preserves an existing custom title without adding a double space', () => {
        const { text } = applyCompletion('> [!no|] Title', 1); // index 1 = tip
        expect(text).toBe('> [!TIP] Title');
    });

    test('normalizes existing custom title separator whitespace to one space', () => {
        const { text } = applyCompletion('> [!no|]   Title', 1);
        expect(text).toBe('> [!TIP] Title');
    });

    test('replaces the remaining marker suffix when completing from the middle of an alert type', () => {
        const { text } = applyCompletion('> [!|OTE]', 1);
        expect(text).toBe('> [!TIP] ');
    });

    test('does not consume following text that is not part of a closed marker', () => {
        const { text } = applyCompletion('> [!|Title', 1);
        expect(text).toBe('> [!TIP] Title');
    });

    test('cursor is placed immediately after the trailing space', () => {
        const { text, cursor } = applyCompletion('>!|', 0);
        expect(cursor).toBe(text.length); // end of "> [!NOTE] "
    });

    test('preserves leading whitespace in the resulting line', () => {
        const { text } = applyCompletion('   >!|', 2); // index 2 = important
        expect(text).toBe('   > [!IMPORTANT] ');
    });

    test('cursor is correct when leading whitespace is present', () => {
        const { text, cursor } = applyCompletion('   >!|', 2);
        expect(cursor).toBe(text.length);
    });

    test('inserts tip (index 1) with uppercase type', () => {
        const { text } = applyCompletion('>!|', 1);
        expect(text).toBe('> [!TIP] ');
    });

    test('works on a line that is not the first line of the document', () => {
        const { text } = applyCompletion('first line\n>!|', 3); // index 3 = warning
        expect(text).toBe('first line\n> [!WARNING] ');
    });

    test('applies the selected completion to every matching cursor', () => {
        const harness = createAutocompleteEnabledHarness(['> [!w]', '> [!w]'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line2 = harness.view.state.doc.line(2);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from + '> [!w'.length),
                    EditorSelection.cursor(line2.from + '> [!w'.length),
                ]),
            });

            const source = createAlertCompletionSource();
            const cursorPos = harness.view.state.selection.main.head;
            const result = source(makeContext(harness.view, cursorPos)) as CompletionResult;
            const option = result.options[3]; // warning
            const applyFn = option.apply as (
                view: EditorView,
                completion: (typeof result.options)[0],
                from: number,
                to: number
            ) => void;

            applyFn(harness.view, option, result.from, result.to ?? cursorPos);

            expect(harness.getText()).toBe(['> [!WARNING] ', '> [!WARNING] '].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([13, 27]);
        } finally {
            harness.destroy();
        }
    });

    test('leaves non-alert cursors unchanged when applying across matching cursors', () => {
        const harness = createAutocompleteEnabledHarness(['> [!w]', 'plain', '> [!w]'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line2 = harness.view.state.doc.line(2);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from + '> [!w'.length),
                    EditorSelection.cursor(line2.from + 'pl'.length),
                    EditorSelection.cursor(line3.from + '> [!w'.length),
                ]),
            });

            const source = createAlertCompletionSource();
            const cursorPos = harness.view.state.selection.main.head;
            const result = source(makeContext(harness.view, cursorPos)) as CompletionResult;
            const option = result.options[1]; // tip
            const applyFn = option.apply as (
                view: EditorView,
                completion: (typeof result.options)[0],
                from: number,
                to: number
            ) => void;

            applyFn(harness.view, option, result.from, result.to ?? cursorPos);

            expect(harness.getText()).toBe(['> [!TIP] ', 'plain', '> [!TIP] '].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([9, 12, 25]);
        } finally {
            harness.destroy();
        }
    });
});
