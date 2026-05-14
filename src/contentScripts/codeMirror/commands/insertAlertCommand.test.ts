/** @jest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { createInsertAlertCommand, toggleAlertSelectionText } from './insertAlertCommand';
import { createEditorHarness } from '../shared/testUtils';

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

    function runCommandWithSelection(input: string): { text: string; selection: { anchor: number; head: number } } {
        const harness = createEditorHarness(input);
        try {
            const command = createInsertAlertCommand(harness.view);
            command();
            return { text: harness.getText(), selection: harness.getSelection() };
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

    test('selects alert type after inserting alert marker on blank line', () => {
        const input = '|\n';
        const expectedText = `> [!NOTE] \n`;

        const result = runCommandWithSelection(input);

        expect(result.text).toBe(expectedText);
        expect(result.selection).toEqual({ anchor: 4, head: 8 });
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
            const selections = harness.view.state.selection.ranges;
            expect(selections.map((range) => ({ anchor: range.anchor, head: range.head }))).toEqual([
                { anchor: 4, head: 8 },
                { anchor: 24, head: 37 },
            ]);
            expect(harness.view.state.doc.sliceString(selections[1].anchor, selections[1].head)).toBe('Selected line');
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

    test('selects each alert type after inserting alert markers on blank lines', () => {
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
            expect(
                harness.view.state.selection.ranges.map((range) => ({ anchor: range.anchor, head: range.head }))
            ).toEqual([
                { anchor: 4, head: 8 },
                { anchor: 16, head: 20 },
            ]);
        } finally {
            harness.destroy();
        }
    });

    test('preserves partial body selection when cycling an expanded alert paragraph', () => {
        const harness = createEditorHarness(
            ['> [!NOTE]', '> ABCACC', '> abc 123', '> [[sadads sad]] das abad s dsadsa dsa'].join('\n')
        );

        try {
            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe(
                ['> [!TIP]', '> ABCACC', '> abc 123', '> sadads sad das abad s dsadsa dsa'].join('\n')
            );

            const selection = harness.getSelection();
            expect(harness.view.state.doc.sliceString(selection.anchor, selection.head)).toBe('sadads sad');
        } finally {
            harness.destroy();
        }
    });

    test('selects the next alert type when cycling a selected alert type', () => {
        const harness = createEditorHarness('> [![[NOTE]]] ');

        try {
            const command = createInsertAlertCommand(harness.view);
            command();

            expect(harness.getText()).toBe('> [!TIP] ');

            const selection = harness.getSelection();
            expect(harness.view.state.doc.sliceString(selection.anchor, selection.head)).toBe('TIP');
        } finally {
            harness.destroy();
        }
    });
});
