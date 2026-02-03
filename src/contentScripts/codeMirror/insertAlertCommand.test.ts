/** @jest-environment jsdom */
import { createInsertAlertCommand, toggleAlertSelectionText } from './insertAlertCommand';
import { createEditorHarness } from './testUtils';

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

    test('converts a partially selected paragraph into an alert block', () => {
        const input = ['Intro line', '', 'Se[[cond paragraph]]'].join('\n');
        const expected = ['Intro line', '', '> [!NOTE]', '> Second paragraph'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('includes headings when converting selection to an alert', () => {
        const input = ['[[## Heading', '', 'Paragraph]]'].join('\n');
        const expected = ['> [!NOTE]', '> ## Heading', '> ', '> Paragraph'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });
});
