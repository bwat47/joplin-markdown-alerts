/** @jest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { INLINE_FORMAT_COMMANDS } from '../../inlineFormatCommands';
import {
    applyInlineFormattingToFullLineSelectionText,
    applyInlineFormattingToSelectionText,
    createInsertInlineFormatCommand,
} from './insertInlineFormatCommand';
import { createEditorHarness } from './testUtils';

function getFormat(id: (typeof INLINE_FORMAT_COMMANDS)[number]['id']) {
    const format = INLINE_FORMAT_COMMANDS.find((entry) => entry.id === id);
    if (!format) {
        throw new Error(`Missing inline format definition for ${id}`);
    }

    return format;
}

describe('applyInlineFormattingToSelectionText', () => {
    test('wraps the whole selection when the target formatting is not present', () => {
        expect(applyInlineFormattingToSelectionText('abc', getFormat('highlight'))).toBe('==abc==');
    });

    test('unwraps the whole selection when it is already wrapped', () => {
        expect(applyInlineFormattingToSelectionText('==abc==', getFormat('highlight'))).toBe('abc');
    });

    test('removes existing inner target spans without touching other formatting', () => {
        expect(
            applyInlineFormattingToSelectionText('test ~~abc~~ **def** aaaa', getFormat('strikethrough'))
        ).toBe('test abc **def** aaaa');
    });

    test('removes repeated target-formatted spans in one selection', () => {
        expect(
            applyInlineFormattingToSelectionText('~~one~~ and ~~two~~', getFormat('strikethrough'))
        ).toBe('one and two');
    });

    test('does not misread strikethrough as subscript formatting', () => {
        expect(applyInlineFormattingToSelectionText('~~abc~~', getFormat('subscript'))).toBe('~~~abc~~~');
    });
});

describe('applyInlineFormattingToFullLineSelectionText', () => {
    test('formats multiline full-line list selections item by item and preserves blank lines', () => {
        const input = ['- one', '1. ~~two~~', '> - [ ] three', '', '> 1. [x] ~~four~~'].join('\n');
        const expected = ['- ~~one~~', '1. two', '> - [ ] ~~three~~', '', '> 1. [x] four'].join('\n');

        expect(applyInlineFormattingToFullLineSelectionText(input, getFormat('strikethrough'))).toBe(expected);
    });
});

describe('createInsertInlineFormatCommand', () => {
    function runCommand(input: string, formatId: (typeof INLINE_FORMAT_COMMANDS)[number]['id']): string {
        const harness = createEditorHarness(input);

        try {
            const command = createInsertInlineFormatCommand(harness.view, getFormat(formatId));
            command();
            return harness.getText();
        } finally {
            harness.destroy();
        }
    }

    function runCommandWithCursor(
        input: string,
        formatId: (typeof INLINE_FORMAT_COMMANDS)[number]['id']
    ): { text: string; cursor: number } {
        const harness = createEditorHarness(input);

        try {
            const command = createInsertInlineFormatCommand(harness.view, getFormat(formatId));
            command();
            return { text: harness.getText(), cursor: harness.getCursor() };
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
        const harness = createEditorHarness(['- one', '1. ~~two~~', '> - [ ] three', '', '> 1. [x] ~~four~~', 'tail'].join('\n'));

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
                    '> 1. ==`nestedEditorController`  ==',
                    '>     ==Own session state, open/close, rebase, sync application.==',
                    '> ',
                    '> 2. ==`nestedEditorInteractions`  ==',
                    '>     ==Own keymaps, DOM handlers, command routing, selection flushing triggers.==',
                    'tail',
                ].join('\n')
            );
        } finally {
            harness.destroy();
        }
    });
});
