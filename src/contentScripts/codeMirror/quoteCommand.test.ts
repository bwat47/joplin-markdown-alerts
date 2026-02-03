import { convertToBlockquoteText } from './quoteCommand';

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
