import { toggleBlockquoteText } from './quoteCommand';

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
