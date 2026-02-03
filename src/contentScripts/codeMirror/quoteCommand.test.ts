/** @jest-environment jsdom */
import { createQuoteSelectionCommand, toggleBlockquoteText } from './quoteCommand';
import { createEditorHarness } from './testUtils';

describe('toggleBlockquoteText', () => {
    test('removes blockquote prefix when all lines are quoted', () => {
        const input = ['> First line', '> ', '> Second line'].join('\n');
        const expected = ['First line', '', 'Second line'].join('\n');

        expect(toggleBlockquoteText(input)).toBe(expected);
    });

    test('removes a single blockquote level from nested quotes', () => {
        const input = ['>> Nested line', '>> Another line'].join('\n');
        const expected = ['> Nested line', '> Another line'].join('\n');

        expect(toggleBlockquoteText(input)).toBe(expected);
    });

    test('adds blockquote prefix when any line is not quoted', () => {
        const input = ['> Quoted line', 'Plain line'].join('\n');
        const expected = ['> > Quoted line', '> Plain line'].join('\n');

        expect(toggleBlockquoteText(input)).toBe(expected);
    });
});

describe('createQuoteSelectionCommand', () => {
    function runCommand(input: string): string {
        const harness = createEditorHarness(input);
        try {
            const command = createQuoteSelectionCommand(harness.view);
            command();
            return harness.getText();
        } finally {
            harness.destroy();
        }
    }

    test('quotes paragraph when cursor is at the start', () => {
        const input = '|Paragraph';
        const expected = '> Paragraph';

        expect(runCommand(input)).toBe(expected);
    });

    test('quotes entire paragraph when cursor is inside it', () => {
        const input = ['First line', 'Sec|ond line'].join('\n');
        const expected = ['> First line', '> Second line'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('unquotes when cursor is before the blockquote marker', () => {
        const input = '|> Quoted line';
        const expected = 'Quoted line';

        expect(runCommand(input)).toBe(expected);
    });

    test('inserts empty blockquote on blank line', () => {
        const input = '|\n';
        const expected = '> \n';

        expect(runCommand(input)).toBe(expected);
    });

    test('quotes code block lines inside selection', () => {
        const input = [
            '[[Paragraph',
            '',
            '```',
            'code block',
            '```',
            '',
            'Paragraph]]',
        ].join('\n');
        const expected = [
            '> Paragraph',
            '> ',
            '> ```',
            '> code block',
            '> ```',
            '> ',
            '> Paragraph',
        ].join('\n');

        expect(runCommand(input)).toBe(expected);
    });

    test('quotes only unquoted paragraphs in mixed selection', () => {
        const input = ['[[> Quoted line', '', 'Plain line]]'].join('\n');
        const expected = ['> Quoted line', '> ', '> Plain line'].join('\n');

        expect(runCommand(input)).toBe(expected);
    });
});
