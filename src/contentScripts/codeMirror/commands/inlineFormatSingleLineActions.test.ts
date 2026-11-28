import {
    getInlineFormatDefinition,
    type InlineFormatId,
    type InlineFormatSyntaxMode,
} from '../../../inlineFormatCommands';
import {
    analyzeSingleLineCursorAction,
    analyzeSingleLineSelectionRemoval,
    formatSelectionText,
    selectionTextHasTargetFormatting,
} from './inlineFormatSingleLineActions';

function getFormat(id: InlineFormatId, syntaxMode?: InlineFormatSyntaxMode) {
    return getInlineFormatDefinition(id, syntaxMode);
}

describe('formatSelectionText', () => {
    test('wraps the whole selection in add mode', () => {
        expect(formatSelectionText('abc', getFormat('highlight'), 'add')).toBe('==abc==');
    });

    test('unwraps the whole selection in remove mode when it is already wrapped', () => {
        expect(formatSelectionText('==abc==', getFormat('highlight'), 'remove')).toBe('abc');
    });

    test('removes existing inner target spans without touching other formatting', () => {
        expect(formatSelectionText('test ~~abc~~ **def** aaaa', getFormat('strikethrough'), 'remove')).toBe(
            'test abc **def** aaaa'
        );
    });

    test('removes repeated target-formatted spans in one selection', () => {
        expect(formatSelectionText('~~one~~ and ~~two~~', getFormat('strikethrough'), 'remove')).toBe('one and two');
    });

    test('leaves unformatted text unchanged in remove mode', () => {
        expect(formatSelectionText('plain text', getFormat('strikethrough'), 'remove')).toBe('plain text');
    });

    test('keeps trailing spaces outside newly added delimiters', () => {
        expect(formatSelectionText('ABC  ', getFormat('highlight'), 'add')).toBe('==ABC==  ');
    });

    test('keeps leading spaces outside newly added delimiters', () => {
        expect(formatSelectionText('  ABC', getFormat('highlight'), 'add')).toBe('  ==ABC==');
    });

    test('wraps the whole selection with superscript HTML when configured', () => {
        expect(formatSelectionText('abc', getFormat('superscript', 'html'), 'add')).toBe('<sup>abc</sup>');
    });

    test('unwraps exact superscript HTML markup when configured', () => {
        expect(formatSelectionText('<sup>abc</sup>', getFormat('superscript', 'html'), 'remove')).toBe('abc');
    });

    test('wraps the whole selection with subscript HTML when configured', () => {
        expect(formatSelectionText('abc', getFormat('subscript', 'html'), 'add')).toBe('<sub>abc</sub>');
    });

    test('unwraps exact subscript HTML markup when configured', () => {
        expect(formatSelectionText('<sub>abc</sub>', getFormat('subscript', 'html'), 'remove')).toBe('abc');
    });
});

describe('selectionTextHasTargetFormatting', () => {
    test('detects a wrapped target span', () => {
        expect(selectionTextHasTargetFormatting('a ==b== c', getFormat('highlight'))).toBe(true);
    });

    test('does not misread strikethrough as subscript formatting', () => {
        expect(selectionTextHasTargetFormatting('~~abc~~', getFormat('subscript', 'markdown'))).toBe(false);
    });
});

describe('analyzeSingleLineSelectionRemoval', () => {
    test('returns null when the selection does not overlap the target format', () => {
        expect(
            analyzeSingleLineSelectionRemoval(
                'plain text',
                { from: 0, to: 5, anchor: 0, head: 5 },
                getFormat('strikethrough')
            )
        ).toBeNull();
    });

    test('unwraps overlapping formatted content and remaps the selection offsets', () => {
        expect(
            analyzeSingleLineSelectionRemoval(
                'open ~~source~~ note taking',
                { from: 7, to: 13, anchor: 7, head: 13 },
                getFormat('strikethrough')
            )
        ).toEqual({
            kind: 'selection-removal',
            replaceFrom: 5,
            replaceTo: 15,
            insert: 'source',
            nextAnchor: 5,
            nextHead: 11,
            selectionBase: 5,
        });
    });

    test('unwraps repeated target-formatted spans inside the selected range', () => {
        expect(
            analyzeSingleLineSelectionRemoval(
                '~~one~~ and ~~two~~',
                { from: 0, to: 19, anchor: 0, head: 19 },
                getFormat('strikethrough')
            )
        ).toEqual({
            kind: 'selection-removal',
            replaceFrom: 0,
            replaceTo: 19,
            insert: 'one and two',
            nextAnchor: 0,
            nextHead: 11,
            selectionBase: 0,
        });
    });
});

describe('analyzeSingleLineCursorAction', () => {
    test('jumps into the wrapped content when the cursor is at the opening delimiter', () => {
        expect(analyzeSingleLineCursorAction('~~abc~~', 0, getFormat('strikethrough'))).toEqual({
            kind: 'cursor-jump-in',
            replaceFrom: 0,
            replaceTo: 0,
            insert: '',
            nextAnchor: 2,
            nextHead: 2,
            selectionBase: 0,
        });
    });

    test('jumps past the closing delimiter when the cursor is at the content end', () => {
        expect(analyzeSingleLineCursorAction('~~abc~~', 5, getFormat('strikethrough'))).toEqual({
            kind: 'cursor-jump-out',
            replaceFrom: 5,
            replaceTo: 5,
            insert: '',
            nextAnchor: 7,
            nextHead: 7,
            selectionBase: 7,
        });
    });

    test('removes the wrapping when the cursor is inside the wrapped content', () => {
        expect(analyzeSingleLineCursorAction('~~abc~~', 3, getFormat('strikethrough'))).toEqual({
            kind: 'cursor-removal',
            replaceFrom: 0,
            replaceTo: 7,
            insert: 'abc',
            nextAnchor: 0,
            nextHead: 3,
            selectionBase: 0,
        });
    });

    test('returns null when the cursor is outside any matching wrapped segment', () => {
        expect(analyzeSingleLineCursorAction('plain text', 3, getFormat('strikethrough'))).toBeNull();
    });
});
