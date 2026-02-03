import { convertToBlockquoteText, toggleBlockquoteText } from './quoteCommand';

describe('convertToBlockquoteText', () => {
    test('prefixes a single line with a blockquote marker', () => {
        expect(convertToBlockquoteText('Hello world')).toBe('> Hello world');
    });

    test('prefixes each line and preserves blank lines', () => {
        const input = ['First line', '', 'Second line'].join('\n');
        const expected = ['> First line', '> ', '> Second line'].join('\n');

        expect(convertToBlockquoteText(input)).toBe(expected);
    });

    test('preserves trailing newlines by quoting empty trailing lines', () => {
        const input = 'Line one\n';
        const expected = '> Line one\n> ';

        expect(convertToBlockquoteText(input)).toBe(expected);
    });
});

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
