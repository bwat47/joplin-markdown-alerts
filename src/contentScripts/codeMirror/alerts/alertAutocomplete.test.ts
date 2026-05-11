/** @jest-environment jsdom */
import {
    autocompletion,
    completionStatus,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete';
import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createEditorHarness } from '../shared/testUtils';
import { createAlertAutocompleteBackspaceActivationExtension, createAlertCompletionSource } from './alertAutocomplete';
import { GITHUB_ALERT_TYPES } from './alertParsing';

function makeContext(view: EditorView, pos: number): CompletionContext {
    return {
        state: view.state,
        pos,
        explicit: false,
        matchBefore: () => null,
    } as unknown as CompletionContext;
}

function getCompletions(input: string): CompletionResult | null {
    const harness = createEditorHarness(input);
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
        const harness = createEditorHarness('   >!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(5); // 3 spaces + ">!" = 5
        } finally {
            harness.destroy();
        }
    });

    test('from is 2 (after ">!") with no leading whitespace', () => {
        const harness = createEditorHarness('>!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(2);
        } finally {
            harness.destroy();
        }
    });

    test('from is positioned right after "> [!" for full alert syntax prefix', () => {
        const harness = createEditorHarness('> [!|');
        try {
            const source = createAlertCompletionSource();
            const result = source(makeContext(harness.view, harness.getCursor())) as CompletionResult;
            expect(result.from).toBe(4);
        } finally {
            harness.destroy();
        }
    });

    test('to stays at the cursor when an auto-paired closing bracket follows', () => {
        const harness = createEditorHarness('> [!|]');
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
        const harness = createEditorHarness(input);
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
});

describe('createAlertAutocompleteBackspaceActivationExtension', () => {
    async function waitForScheduledCompletionStart() {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    test('restarts completion when backspacing to the shorthand trigger', async () => {
        const source = createAlertCompletionSource();
        const harness = createEditorHarness('>!z|', {
            extensions: [
                autocompletion({ override: [source], activateOnTyping: false }),
                createAlertAutocompleteBackspaceActivationExtension(),
            ],
        });

        try {
            harness.view.dispatch({
                changes: { from: 2, to: 3 },
                selection: { anchor: 2 },
                annotations: Transaction.userEvent.of('delete.backward'),
            });

            await waitForScheduledCompletionStart();

            expect(completionStatus(harness.view.state)).not.toBeNull();
        } finally {
            harness.destroy();
        }
    });

    test('restarts completion when backspacing to the full syntax trigger before a closing bracket', async () => {
        const source = createAlertCompletionSource();
        const harness = createEditorHarness('> [!z|]', {
            extensions: [
                autocompletion({ override: [source], activateOnTyping: false }),
                createAlertAutocompleteBackspaceActivationExtension(),
            ],
        });

        try {
            harness.view.dispatch({
                changes: { from: 4, to: 5 },
                selection: { anchor: 4 },
                annotations: Transaction.userEvent.of('delete.backward'),
            });

            await waitForScheduledCompletionStart();

            expect(completionStatus(harness.view.state)).not.toBeNull();
        } finally {
            harness.destroy();
        }
    });
});
