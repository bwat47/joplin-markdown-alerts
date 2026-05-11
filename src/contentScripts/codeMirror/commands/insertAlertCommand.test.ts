/** @jest-environment jsdom */
import {
    autocompletion,
    completionStatus,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { createInsertAlertCommand, toggleAlertSelectionText } from './insertAlertCommand';
import { createAlertCompletionSource } from '../alerts/alertAutocomplete';
import { createEditorHarness } from '../shared/testUtils';

function makeCompletionContext(view: EditorView, pos: number): CompletionContext {
    return {
        state: view.state,
        pos,
        explicit: false,
        matchBefore: () => null,
    } as unknown as CompletionContext;
}

describe('toggleAlertSelectionText', () => {
    test('adds an alert line and quotes when selection is not a blockquote', () => {
        const input = ['Line one', 'Line two'].join('\n');
        const expected = ['> [!NOTE]', '> Line one', '> Line two'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('inserts alert line above quoted selection without an alert marker', () => {
        const input = ['> Line one', '> Line two'].join('\n');
        const expected = ['> [!NOTE]', '> Line one', '> Line two'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('preserves nested blockquote prefix when inserting alert line', () => {
        const input = ['>> Nested line', '>> Another line'].join('\n');
        const expected = ['>> [!NOTE]', '>> Nested line', '>> Another line'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('toggles alert type when selection already includes alert marker', () => {
        const input = ['> [!NOTE]', '> Line one'].join('\n');
        const expected = ['> [!TIP]', '> Line one'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('toggles alert type while preserving the title text', () => {
        const input = ['> [!warning] Custom title', '> Line one'].join('\n');
        const expected = ['> [!CAUTION] Custom title', '> Line one'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });
});

describe('createInsertAlertCommand', () => {
    async function waitForScheduledCompletionStart() {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    function runCommand(input: string): string {
        const harness = createEditorHarness(input);
        try {
            const command = createInsertAlertCommand(harness.view);
            command();
            return harness.getText();
        } finally {
            harness.destroy();
        }
    }

    function runCommandWithCursor(input: string): { text: string; cursor: number } {
        const harness = createEditorHarness(input);
        try {
            const command = createInsertAlertCommand(harness.view);
            command();
            return { text: harness.getText(), cursor: harness.getCursor() };
        } finally {
            harness.destroy();
        }
    }

    test('toggles alert marker when cursor is before the blockquote marker', () => {
        const input = ['|> [!NOTE]', '> Line one'].join('\n');
        const expected = ['> [!TIP]', '> Line one'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('converts the entire paragraph when cursor is inside it', () => {
        const input = 'Parag|raph';
        const expected = ['> [!NOTE]', '> Paragraph'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('places cursor after alert marker on blank line', () => {
        const input = '|\n';
        const expectedText = `> [!NOTE] \n`;
        const expectedCursor = expectedText.indexOf('\n');

        const result = runCommandWithCursor(input);

        expect(result.text).toBe(expectedText);
        expect(result.cursor).toBe(expectedCursor);
    });

    test('keeps default blank-line insertion when autocomplete is explicitly disabled', () => {
        const harness = createEditorHarness('|\n');

        try {
            const command = createInsertAlertCommand(harness.view, { autocompleteOnEmptyLine: false });
            command();

            expect(harness.getText()).toBe(`> [!NOTE] \n`);
            expect(harness.getCursor()).toBe(10);
        } finally {
            harness.destroy();
        }
    });

    test('starts alert type autocomplete for a single cursor on a blank line when enabled', async () => {
        const source = createAlertCompletionSource();
        const harness = createEditorHarness('|\n', {
            extensions: [autocompletion({ override: [source], activateOnTyping: false })],
        });

        try {
            const command = createInsertAlertCommand(harness.view, { autocompleteOnEmptyLine: true });
            command();

            await waitForScheduledCompletionStart();

            expect(harness.getText()).toBe('> [!]\n');
            expect(harness.getCursor()).toBe(4);
            expect(completionStatus(harness.view.state)).not.toBeNull();

            const result = source(makeCompletionContext(harness.view, harness.getCursor())) as CompletionResult;
            const option = result.options[1];
            const applyFn = option.apply as (
                view: EditorView,
                completion: (typeof result.options)[0],
                from: number,
                to: number
            ) => void;
            applyFn(harness.view, option, result.from, result.to ?? harness.getCursor());

            expect(harness.getText()).toBe('> [!TIP] \n');
            expect(harness.getCursor()).toBe(9);
        } finally {
            harness.destroy();
        }
    });

    test('converts a partially selected paragraph into an alert block', () => {
        const input = ['Intro line', '', 'Se[[cond paragraph]]'].join('\n');
        const expected = ['Intro line', '', '> [!NOTE]', '> Second paragraph'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('handles a mixed selection and additional cursor', () => {
        const harness = createEditorHarness(['Selected line', '', 'Cursor line'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.range(line1.from, line1.to),
                    EditorSelection.cursor(line3.from + 2),
                ]),
            });

            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe(
                ['> [!NOTE]', '> Selected line', '', '> [!NOTE]', '> Cursor line'].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('keeps the blank-line cursor when it appears before a text selection', () => {
        const harness = createEditorHarness(['', '', 'Selected line'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from),
                    EditorSelection.range(line3.from, line3.to),
                ]),
            });

            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe(['> [!NOTE] ', '', '> [!NOTE]', '> Selected line'].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([10, 37]);
        } finally {
            harness.destroy();
        }
    });

    test('includes headings when converting selection to an alert', () => {
        const input = ['[[## Heading', '', 'Paragraph]]'].join('\n');
        const expected = ['> [!NOTE]', '> ## Heading', '> ', '> Paragraph'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('converts each paragraph when multiple cursors are present', () => {
        const harness = createEditorHarness(['First line', '', 'Middle line', '', 'Last line'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line5 = harness.view.state.doc.line(5);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from + 2),
                    EditorSelection.cursor(line5.from + 2),
                ]),
            });

            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe(
                ['> [!NOTE]', '> First line', '', 'Middle line', '', '> [!NOTE]', '> Last line'].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('places each cursor after inserted alert marker on blank lines', () => {
        const harness = createEditorHarness(['', '', ''].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from),
                    EditorSelection.cursor(line3.from),
                ]),
            });

            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe(['> [!NOTE] ', '', '> [!NOTE] '].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([10, 22]);
        } finally {
            harness.destroy();
        }
    });

    test('keeps default blank-line insertion for multiple cursors when autocomplete is enabled', () => {
        const harness = createEditorHarness(['', '', ''].join('\n'), {
            extensions: [
                autocompletion({
                    override: [createAlertCompletionSource()],
                    activateOnTyping: false,
                }),
            ],
        });

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from),
                    EditorSelection.cursor(line3.from),
                ]),
            });

            const command = createInsertAlertCommand(harness.view, { autocompleteOnEmptyLine: true });
            command();

            expect(harness.getText()).toBe(['> [!NOTE] ', '', '> [!NOTE] '].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([10, 22]);
            expect(completionStatus(harness.view.state)).toBeNull();
        } finally {
            harness.destroy();
        }
    });
});
