import {
    getInlineFormatDefinition,
    type InlineFormatId,
    type InlineFormatSyntaxMode,
} from '../../../inlineFormatCommands';
import { analyzeCursorAction, findWrappedSegments, wrapFullLineText, wrapSelectionText } from './inlineFormatText';

function getFormat(id: InlineFormatId, syntaxMode?: InlineFormatSyntaxMode) {
    return getInlineFormatDefinition(id, syntaxMode);
}

describe('findWrappedSegments', () => {
    test('finds every wrapped span of the target format', () => {
        expect(findWrappedSegments('~~one~~ and ~~two~~', getFormat('strikethrough'))).toEqual([
            { from: 0, to: 7 },
            { from: 12, to: 19 },
        ]);
    });

    test('does not match empty delimiter pairs', () => {
        expect(findWrappedSegments('~~~~', getFormat('strikethrough'))).toEqual([]);
    });

    test('does not misread strikethrough as subscript formatting', () => {
        expect(findWrappedSegments('~~abc~~', getFormat('subscript', 'markdown'))).toEqual([]);
    });

    test('finds spans that cross a line break', () => {
        expect(findWrappedSegments('~~one\ntwo~~', getFormat('strikethrough'))).toEqual([{ from: 0, to: 11 }]);
    });

    test('ignores delimiters inside excluded ranges', () => {
        expect(
            findWrappedSegments('`<sup></sup>` before <sup>word</sup>', getFormat('superscript', 'html'), [
                { from: 0, to: 13 },
            ])
        ).toEqual([{ from: 21, to: 36 }]);
    });

    test('ignores a delimiter that only partly overlaps an excluded range', () => {
        expect(findWrappedSegments('a~~b~~', getFormat('strikethrough'), [{ from: 0, to: 2 }])).toEqual([]);
    });
});

describe('wrapSelectionText', () => {
    test('wraps the whole selection', () => {
        expect(wrapSelectionText('abc', getFormat('highlight'))).toBe('==abc==');
    });

    test('keeps leading and trailing spaces outside the delimiters', () => {
        expect(wrapSelectionText('  ABC  ', getFormat('highlight'))).toBe('  ==ABC==  ');
    });

    test('wraps with HTML tags when configured', () => {
        expect(wrapSelectionText('abc', getFormat('superscript', 'html'))).toBe('<sup>abc</sup>');
        expect(wrapSelectionText('abc', getFormat('subscript', 'html'))).toBe('<sub>abc</sub>');
    });
});

describe('wrapFullLineText', () => {
    test('keeps structural prefixes outside the delimiters', () => {
        expect(wrapFullLineText('> - [ ] task', getFormat('underline'))).toBe('> - [ ] ++task++');
    });

    test('leaves whitespace-only and prefix-only lines unchanged', () => {
        expect(wrapFullLineText('   ', getFormat('underline'))).toBe('   ');
        expect(wrapFullLineText('> ', getFormat('underline'))).toBe('> ');
    });
});

describe('analyzeCursorAction', () => {
    const segments = [{ from: 0, to: 7 }];

    test('moves inside the opening delimiter when the cursor is at the segment start', () => {
        expect(analyzeCursorAction(segments, 0, getFormat('strikethrough'))).toEqual({ kind: 'move', position: 2 });
    });

    test('moves past the closing delimiter when the cursor is at the content end', () => {
        expect(analyzeCursorAction(segments, 5, getFormat('strikethrough'))).toEqual({ kind: 'move', position: 7 });
    });

    test('unwraps the segment when the cursor is inside the content', () => {
        expect(analyzeCursorAction(segments, 3, getFormat('strikethrough'))).toEqual({
            kind: 'unwrap',
            segment: { from: 0, to: 7 },
        });
    });

    test('returns null when the cursor is outside every segment', () => {
        expect(analyzeCursorAction(segments, 8, getFormat('strikethrough'))).toBeNull();
    });
});
