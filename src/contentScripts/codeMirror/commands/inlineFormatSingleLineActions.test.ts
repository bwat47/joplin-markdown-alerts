import {
    getInlineFormatDefinition,
    type InlineFormatId,
    type InlineFormatSyntaxMode,
} from '../../../inlineFormatCommands';
import {
    analyzeSingleLineCursorAction,
    analyzeSingleLineSelectionRemoval,
    applyInlineFormattingToSelectionText,
} from './inlineFormatSingleLineActions';

function getFormat(id: InlineFormatId, syntaxMode?: InlineFormatSyntaxMode) {
    return getInlineFormatDefinition(id, syntaxMode);
}

describe('applyInlineFormattingToSelectionText', () => {
    test('wraps the whole selection when the target formatting is not present', () => {
        expect(applyInlineFormattingToSelectionText('abc', getFormat('highlight'))).toBe('==abc==');
    });

    test('unwraps the whole selection when it is already wrapped', () => {
        expect(applyInlineFormattingToSelectionText('==abc==', getFormat('highlight'))).toBe('abc');
    });

    test('removes existing inner target spans without touching other formatting', () => {
        expect(applyInlineFormattingToSelectionText('test ~~abc~~ **def** aaaa', getFormat('strikethrough'))).toBe(
            'test abc **def** aaaa'
        );
    });

    test('removes repeated target-formatted spans in one selection', () => {
        expect(applyInlineFormattingToSelectionText('~~one~~ and ~~two~~', getFormat('strikethrough'))).toBe(
            'one and two'
        );
    });

    test('does not misread strikethrough as subscript formatting', () => {
        expect(applyInlineFormattingToSelectionText('~~abc~~', getFormat('subscript', 'markdown'))).toBe('~~~abc~~~');
    });

    test('keeps trailing spaces outside newly added delimiters', () => {
        expect(applyInlineFormattingToSelectionText('ABC  ', getFormat('highlight'))).toBe('==ABC==  ');
    });

    test('keeps leading spaces outside newly added delimiters', () => {
        expect(applyInlineFormattingToSelectionText('  ABC', getFormat('highlight'))).toBe('  ==ABC==');
    });

    test('wraps the whole selection with superscript HTML when configured', () => {
        expect(applyInlineFormattingToSelectionText('abc', getFormat('superscript', 'html'))).toBe('<sup>abc</sup>');
    });

    test('unwraps exact superscript HTML markup when configured', () => {
        expect(applyInlineFormattingToSelectionText('<sup>abc</sup>', getFormat('superscript', 'html'))).toBe('abc');
    });

    test('wraps the whole selection with subscript HTML when configured', () => {
        expect(applyInlineFormattingToSelectionText('abc', getFormat('subscript', 'html'))).toBe('<sub>abc</sub>');
    });

    test('unwraps exact subscript HTML markup when configured', () => {
        expect(applyInlineFormattingToSelectionText('<sub>abc</sub>', getFormat('subscript', 'html'))).toBe('abc');
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
