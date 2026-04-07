/** @jest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import {
    getInlineFormatDefinition,
    type InlineFormatId,
    type InlineFormatSyntaxMode,
} from '../../inlineFormatCommands';
import {
    applyInlineFormattingToFullLineSelectionText,
    applyInlineFormattingToSelectionText,
    createInsertInlineFormatCommand,
} from './insertInlineFormatCommand';
import { createEditorHarness } from './testUtils';

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

describe('applyInlineFormattingToFullLineSelectionText', () => {
    test('formats multiline full-line list selections item by item and preserves blank lines', () => {
        const input = ['- one', '1. ~~two~~', '> - [ ] three', '', '> 1. [x] ~~four~~'].join('\n');
        const expected = ['- ~~one~~', '1. two', '> - [ ] ~~three~~', '', '> 1. [x] four'].join('\n');

        expect(applyInlineFormattingToFullLineSelectionText(input, getFormat('strikethrough'))).toBe(expected);
    });

    test('formats multiline full-line selections with superscript HTML while preserving structure', () => {
        const input = ['> - one', '## two', '', 'tail'].join('\n');
        const expected = ['> - <sup>one</sup>', '## <sup>two</sup>', '', '<sup>tail</sup>'].join('\n');

        expect(applyInlineFormattingToFullLineSelectionText(input, getFormat('superscript', 'html'))).toBe(expected);
    });
});

describe('createInsertInlineFormatCommand', () => {
    function runCommand(input: string, formatId: InlineFormatId, syntaxMode?: InlineFormatSyntaxMode): string {
        const harness = createEditorHarness(input);

        try {
            const command = createInsertInlineFormatCommand(harness.view, getFormat(formatId, syntaxMode));
            command();
            return harness.getText();
        } finally {
            harness.destroy();
        }
    }

    function runCommandWithCursor(
        input: string,
        formatId: InlineFormatId,
        syntaxMode?: InlineFormatSyntaxMode
    ): { text: string; cursor: number } {
        const harness = createEditorHarness(input);

        try {
            const command = createInsertInlineFormatCommand(harness.view, getFormat(formatId, syntaxMode));
            command();
            return { text: harness.getText(), cursor: harness.getCursor() };
        } finally {
            harness.destroy();
        }
    }

    function runCommandWithSelection(
        input: string,
        formatId: InlineFormatId,
        syntaxMode?: InlineFormatSyntaxMode
    ): { text: string; selection: { anchor: number; head: number } } {
        const harness = createEditorHarness(input);

        try {
            const command = createInsertInlineFormatCommand(harness.view, getFormat(formatId, syntaxMode));
            command();
            return { text: harness.getText(), selection: harness.getSelection() };
        } finally {
            harness.destroy();
        }
    }

    test('wraps a selection when the target formatting is absent', () => {
        const input = '[[test ~~abc~~ **def** aaaa]]';
        const expected = '==test ~~abc~~ **def** aaaa==';

        expect(runCommand(input, 'highlight')).toBe(expected);
    });

    test('inserts delimiters at the cursor and places the cursor between them', () => {
        const result = runCommandWithCursor('|', 'highlight');

        expect(result.text).toBe('====');
        expect(result.cursor).toBe(2);
    });

    test('inserts superscript HTML tags at the cursor and places the cursor between them', () => {
        const result = runCommandWithCursor('|', 'superscript', 'html');

        expect(result.text).toBe('<sup></sup>');
        expect(result.cursor).toBe(5);
    });

    test('inserts subscript HTML tags at the cursor and places the cursor between them', () => {
        const result = runCommandWithCursor('|', 'subscript', 'html');

        expect(result.text).toBe('<sub></sub>');
        expect(result.cursor).toBe(5);
    });

    test('supports multiple cursors', () => {
        const harness = createEditorHarness(['one', 'two'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line2 = harness.view.state.doc.line(2);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.cursor(line1.from + 1),
                    EditorSelection.cursor(line2.from + 1),
                ]),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('underline'));
            command();

            expect(harness.getText()).toBe(['o++++ne', 't++++wo'].join('\n'));
            expect(harness.view.state.selection.ranges.map((range) => range.head)).toEqual([3, 11]);
        } finally {
            harness.destroy();
        }
    });

    test('supports multiple selections', () => {
        const harness = createEditorHarness(['First line', '', 'Middle line', '', 'Last line'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line5 = harness.view.state.doc.line(5);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.range(line1.from, line1.to),
                    EditorSelection.range(line5.from, line5.to),
                ]),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['==First line==', '', 'Middle line', '', '==Last line=='].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('handles a mixed selection and additional cursor', () => {
        const harness = createEditorHarness(['Selected text', '', 'Cursor line'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.range(line1.from, line1.to),
                    EditorSelection.cursor(line3.from + 6),
                ]),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('strikethrough'));
            command();

            expect(harness.getText()).toBe(['~~Selected text~~', '', 'Cursor~~~~ line'].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('applies multiline full-line selections line by line and preserves list markers', () => {
        const harness = createEditorHarness(
            ['- one', '1. ~~two~~', '> - [ ] three', '', '> 1. [x] ~~four~~', 'tail'].join('\n')
        );

        try {
            const line1 = harness.view.state.doc.line(1);
            const line6 = harness.view.state.doc.line(6);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line6.from),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('strikethrough'));
            command();

            expect(harness.getText()).toBe(
                ['- ~~one~~', '1. two', '> - [ ] ~~three~~', '', '> 1. [x] four', 'tail'].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('applies line-aware formatting to fully selected trailing lines in a mixed multiline selection', () => {
        const input = [
            'Joplin is a free, [[open source note taking and to-do application.',
            '',
            'Notes exported from Evernote into Joplin can also be imported.]]',
        ].join('\n');
        const expected = [
            'Joplin is a free, ~~open source note taking and to-do application.~~',
            '',
            '~~Notes exported from Evernote into Joplin can also be imported.~~',
        ].join('\n');

        expect(runCommand(input, 'strikethrough')).toBe(expected);
    });

    test('applies line-aware formatting to fully selected leading lines in a mixed multiline selection', () => {
        const input = [
            '[[Joplin is a free, open source note taking and to-do application.',
            '',
            'Notes exported from Evernote into Joplin]] can also be imported.',
        ].join('\n');
        const expected = [
            '~~Joplin is a free, open source note taking and to-do application.~~',
            '',
            '~~Notes exported from Evernote into Joplin~~ can also be imported.',
        ].join('\n');

        expect(runCommand(input, 'strikethrough')).toBe(expected);
    });

    test('preserves blockquote-prefixed list markers while formatting only item content', () => {
        const harness = createEditorHarness(['> - one', '> - two', 'tail'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line3.from),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['> - ==one==', '> - ==two==', 'tail'].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('preserves blockquote-prefixed list markers for a single full-line selection', () => {
        const harness = createEditorHarness(['> - abc test', 'tail'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line1.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['> - ==abc test==', 'tail'].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('skips fenced code lines during multiline full-line formatting', () => {
        const harness = createEditorHarness(
            ['- one', '```ts', '- inside code', 'plain code', '```', '> - [ ] three', 'tail'].join('\n')
        );

        try {
            const line1 = harness.view.state.doc.line(1);
            const line7 = harness.view.state.doc.line(7);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line7.from),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(
                ['- ==one==', '```ts', '- inside code', 'plain code', '```', '> - [ ] ==three==', 'tail'].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('skips indented code block lines during multiline full-line formatting', () => {
        const harness = createEditorHarness(
            ['Intro', '', '    const x = 1;', '    const y = 2;', '', 'Tail'].join('\n')
        );

        try {
            const line1 = harness.view.state.doc.line(1);
            const line6 = harness.view.state.doc.line(6);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line6.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(
                ['==Intro==', '', '    const x = 1;', '    const y = 2;', '', '==Tail=='].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('skips markdown table lines during multiline full-line formatting', () => {
        const harness = createEditorHarness(['Intro', '| A | B |', '| - | - |', '| one | two |', 'Tail'].join('\n'), {
            rawInput: true,
        });

        try {
            const line1 = harness.view.state.doc.line(1);
            const line5 = harness.view.state.doc.line(5);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line5.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(
                ['==Intro==', '| A | B |', '| - | - |', '| one | two |', '==Tail=='].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('skips blockquoted markdown table lines during multiline full-line formatting', () => {
        const harness = createEditorHarness(['> | A | B |', '> | - | - |', '> | one | two |', 'Tail'].join('\n'), {
            rawInput: true,
        });

        try {
            const line1 = harness.view.state.doc.line(1);
            const line4 = harness.view.state.doc.line(4);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line4.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['> | A | B |', '> | - | - |', '> | one | two |', '==Tail=='].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('skips horizontal rule lines during multiline full-line formatting', () => {
        // Blank lines are required around --- so it is parsed as a horizontal rule, not a setext heading marker.
        const harness = createEditorHarness(['Intro', '', '---', '', 'Tail'].join('\n'), { rawInput: true });

        try {
            const line1 = harness.view.state.doc.line(1);
            const line5 = harness.view.state.doc.line(5);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line5.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['==Intro==', '', '---', '', '==Tail=='].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('skips horizontal rule lines (asterisk variant) during multiline full-line formatting', () => {
        const harness = createEditorHarness(['Intro', '', '***', '', 'Tail'].join('\n'), { rawInput: true });

        try {
            const line1 = harness.view.state.doc.line(1);
            const line5 = harness.view.state.doc.line(5);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line5.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['==Intro==', '', '***', '', '==Tail=='].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    test('preserves heading and blockquote markers in a full-line mixed selection', () => {
        const harness = createEditorHarness(
            [
                '## Test',
                '',
                '> **Suggested Shape**',
                '> If I were reorganizing it, I would aim for five modules:',
                '> ',
                '> 1. `nestedEditorController`  ',
                '>     Own session state, open/close, rebase, sync application.',
                '> ',
                '> 2. `nestedEditorInteractions`  ',
                '>     Own keymaps, DOM handlers, command routing, selection flushing triggers.',
                'tail',
            ].join('\n')
        );

        try {
            const line1 = harness.view.state.doc.line(1);
            const line11 = harness.view.state.doc.line(11);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line11.from),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(
                [
                    '## ==Test==',
                    '',
                    '> ==**Suggested Shape**==',
                    '> ==If I were reorganizing it, I would aim for five modules:==',
                    '> ',
                    '> 1. ==`nestedEditorController`==  ',
                    '>     ==Own session state, open/close, rebase, sync application.==',
                    '> ',
                    '> 2. ==`nestedEditorInteractions`==  ',
                    '>     ==Own keymaps, DOM handlers, command routing, selection flushing triggers.==',
                    'tail',
                ].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });

    test('keeps surrounding spaces outside newly added delimiters in structural lines', () => {
        const harness = createEditorHarness(['>   ABC  ', 'tail'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);

            harness.view.dispatch({
                selection: EditorSelection.single(line1.from, line1.to),
            });

            const command = createInsertInlineFormatCommand(harness.view, getFormat('highlight'));
            command();

            expect(harness.getText()).toBe(['>   ==ABC==  ', 'tail'].join('\n'));
        } finally {
            harness.destroy();
        }
    });

    describe('cursor inside existing formatting — removes formatting and selects content', () => {
        test('removes strikethrough when cursor is inside formatted text', () => {
            // cursor after 'strike' in '~~strikethrough~~'
            const input = 'this is a ~~strikethrough~~ test';
            const cursorPos = 'this is a ~~strike'.length;
            const harness = createEditorHarness(input.slice(0, cursorPos) + '|' + input.slice(cursorPos));

            try {
                const command = createInsertInlineFormatCommand(harness.view, getFormat('strikethrough'));
                command();
                expect(harness.getText()).toBe('this is a strikethrough test');
                const sel = harness.getSelection();
                expect(sel.anchor).toBe('this is a '.length);
                expect(sel.head).toBe('this is a strikethrough'.length);
            } finally {
                harness.destroy();
            }
        });

        test('removes highlight when cursor is inside formatted text', () => {
            const result = runCommandWithSelection('==hig|hlight==', 'highlight');
            expect(result.text).toBe('highlight');
            expect(result.selection.anchor).toBe(0);
            expect(result.selection.head).toBe('highlight'.length);
        });

        test('removes only the matching format for nested formatting', () => {
            // cursor inside strikethrough text that is also highlighted
            const result = runCommandWithSelection('==~~strike|through~~==', 'strikethrough');
            expect(result.text).toBe('==strikethrough==');
            expect(result.selection.anchor).toBe('=='.length);
            expect(result.selection.head).toBe('==strikethrough'.length);
        });

        test('removes only highlight when cursor is inside nested formatting and highlight command is used', () => {
            const result = runCommandWithSelection('==~~strike|through~~==', 'highlight');
            expect(result.text).toBe('~~strikethrough~~');
            expect(result.selection.anchor).toBe(0);
            expect(result.selection.head).toBe('~~strikethrough~~'.length);
        });

        test('does not remove formatting when cursor is right before the opening delimiter', () => {
            // cursor at position 0 — check is cursorOffset > segment.from (0 > 0 is false), so no removal
            const result = runCommandWithSelection('|~~text~~', 'strikethrough');
            expect(result.text).toBe('~~~~~~text~~');
        });

        test('does not remove formatting when cursor is right after the closing delimiter', () => {
            // cursor right after '~~text~~'
            const result = runCommandWithSelection('~~text~~|', 'strikethrough');
            expect(result.text).toBe('~~text~~~~~~');
        });

        test('does not remove empty delimiters (no content) when cursor is inside ~~~~', () => {
            // '~~~~': findWrappedSegments skips the closing delimiter when it equals contentStart (empty content),
            // so no segment is found and the cursor insertion path runs instead
            const result = runCommandWithSelection('~~|~~', 'strikethrough');
            expect(result.text).toBe('~~~~~~~~');
        });

        test('removes formatting when cursor is on the opening delimiter', () => {
            // cursor at position 1 (inside '~~' opening delimiter)
            const result = runCommandWithSelection('~|~text~~', 'strikethrough');
            expect(result.text).toBe('text');
            expect(result.selection.anchor).toBe(0);
            expect(result.selection.head).toBe('text'.length);
        });

        test('removes formatting when cursor is on the closing delimiter', () => {
            // cursor at position inside the closing '~~'
            const result = runCommandWithSelection('~~text~|~', 'strikethrough');
            expect(result.text).toBe('text');
            expect(result.selection.anchor).toBe(0);
            expect(result.selection.head).toBe('text'.length);
        });

        test('removes correct segment when multiple formatted segments exist on a line', () => {
            // cursor inside second segment
            const result = runCommandWithSelection('~~foo~~ bar ~~ba|z~~', 'strikethrough');
            expect(result.text).toBe('~~foo~~ bar baz');
            expect(result.selection.anchor).toBe('~~foo~~ bar '.length);
            expect(result.selection.head).toBe('~~foo~~ bar baz'.length);
        });

        test('removes formatting inside blockquote prefix', () => {
            const result = runCommandWithSelection('> ~~str|ike~~', 'strikethrough');
            expect(result.text).toBe('> strike');
            expect(result.selection.anchor).toBe('> '.length);
            expect(result.selection.head).toBe('> strike'.length);
        });

        test('removes HTML superscript tags when cursor is inside them', () => {
            const result = runCommandWithSelection('<sup>te|xt</sup>', 'superscript', 'html');
            expect(result.text).toBe('text');
            expect(result.selection.anchor).toBe(0);
            expect(result.selection.head).toBe('text'.length);
        });

        test('does not remove strikethrough delimiters with subscript command due to conflicting delimiters', () => {
            // subscript markdown uses '~' but has conflictingLongerDelimiters: ['~~']
            // so '~~text~~' is not detected as subscript formatting — cursor insertion runs instead
            const result = runCommandWithSelection('~~tex|t~~', 'subscript', 'markdown');
            expect(result.text).toBe('~~tex~~t~~');
        });
    });
});
