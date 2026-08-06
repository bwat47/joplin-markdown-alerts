/** @vitest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { clearMarkdownFormattingSelectionText, createClearFormattingCommand } from './clearFormattingCommand';
import { createEditorHarness } from '../shared/testUtils';

const RESOURCE_ID = ':/5622253ddc404beaa9becd86d48095c5';

describe('clearMarkdownFormattingSelectionText', () => {
    test.each([
        {
            name: 'removes supported inline markdown formatting markers',
            input: '**_Bold Italic_** ~~Strike~~ ==Highlight== ++Underline++ ^Sup^ ~Sub~',
            expected: 'Bold Italic Strike Highlight Underline Sup Sub',
        },
        {
            name: 'leaves incomplete standard markdown delimiters to the parser instead of regex fallbacks',
            input: '**Bold and _italic',
            expected: '**Bold and _italic',
        },
        {
            name: 'does not rewrite literal text that matches the old printable placeholder format',
            input: '@@MDCLR0@@ [Link](https://example.com)',
            expected: '@@MDCLR0@@ https://example.com',
        },
        {
            name: 'removes heading and blockquote markers without breaking table pipes',
            input: ['> ## **Title**', '| **A** | [B](https://example.com/path) |'].join('\n'),
            expected: ['Title', '| A | https://example.com/path |'].join('\n'),
        },
        {
            name: 'removes numbered, nested, and task list markers',
            input: ['1. **Item**', '  - - _Sub-item_', '- [ ] ~~Task~~', '  1. [x] ++Done++'].join('\n'),
            expected: ['Item', 'Sub-item', 'Task', 'Done'].join('\n'),
        },
        {
            name: 'extracts external markdown and html image destinations while preserving Joplin resources',
            input: [
                '[Joplin Cloud](https://joplinapp.org/plans/)',
                '![External](https://example.com/image.png)',
                '![Alt][external-image]',
                `![Resource](${RESOURCE_ID})`,
                '<img src="https://example.com/external.png" alt="External">',
                `<img src="${RESOURCE_ID}" alt="Resource">`,
            ].join('\n'),
            expected: [
                'https://joplinapp.org/plans/',
                'https://example.com/image.png',
                'Alt',
                `![Resource](${RESOURCE_ID})`,
                'https://example.com/external.png',
                `<img src="${RESOURCE_ID}" alt="Resource">`,
            ].join('\n'),
        },
        {
            name: 'uses parser destinations for nested formatted links with titles and parentheses',
            input: '**[Label](https://example.com/a_(b) "title")**',
            expected: 'https://example.com/a_(b)',
        },
        {
            name: 'removes reference-link and footnote syntax from selected text',
            input: [
                'Link to [Case Test][UpPeR] and ref [^1]',
                '[^1]: Footnote1',
                '[UpPeR]: https://example.com/reference',
            ].join('\n'),
            expected: ['Link to Case Test and ref', 'Footnote1', 'https://example.com/reference'].join('\n'),
        },
        {
            name: 'clears markdown syntax from footnote definition bodies',
            input: ['[^1]: [link](https://example.com/footnote)', '[^2]: ![alt](https://example.com/image.png)'].join(
                '\n'
            ),
            expected: ['https://example.com/footnote', 'https://example.com/image.png'].join('\n'),
        },
        {
            name: 'preserves markdown-like text in footnote definition URLs',
            input: '[^1]: https://example.com/++foo++',
            expected: 'https://example.com/++foo++',
        },
        {
            name: 'preserves table structure while clearing inline cell formatting',
            input: [
                '| **Name** | [Site](https://example.com/a_(b)) |',
                '| --- | --- |',
                '| `**Literal**` | ~~Done~~ |',
            ].join('\n'),
            expected: ['| Name | https://example.com/a_(b) |', '| --- | --- |', '| **Literal** | Done |'].join('\n'),
        },
        {
            name: 'removes code markers while preserving literal markdown inside code content',
            input: ['`**bold**`', '```ts', '**literal**', '[link](https://example.com)', '```'].join('\n'),
            expected: ['**bold**', '**literal**', '[link](https://example.com)'].join('\n'),
        },
        {
            name: 'preserves literal markdown inside inline and fenced code after other cleanup passes',
            input: ['`[link](https://example.com) and ~~strike~~`', '~~~', '++under++ and ==mark==', '~~~'].join('\n'),
            expected: ['[link](https://example.com) and ~~strike~~', '++under++ and ==mark=='].join('\n'),
        },
        {
            name: 'removes supported html formatting tags',
            input: '<sup>Sup</sup> <sub>Sub</sub> <strong>Bold</strong> <em>Italic</em>',
            expected: 'Sup Sub Bold Italic',
        },
        {
            name: 'removes GitHub alert marker lines and keeps custom titles',
            input: ['> [!NOTE]', '> body', '> [!WARNING] Custom title', '> **bold** body'].join('\n'),
            expected: ['', 'body', 'Custom title', 'bold body'].join('\n'),
        },
        {
            name: 'removes plain alert marker lines without blockquote prefixes',
            input: ['[!TIP]', '[!IMPORTANT] Optional title'].join('\n'),
            expected: ['', 'Optional title'].join('\n'),
        },
        {
            name: 'removes thematic break lines',
            input: ['***', '* * *', '---', '- - -', '___', '_ _ _', '> ---', '> * * *'].join('\n'),
            expected: ['', '', '', '', '', '', '', ''].join('\n'),
        },
    ])('$name', ({ input, expected }) => {
        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });
});

describe('createClearFormattingCommand', () => {
    test('returns false for a cursor-only selection', () => {
        const harness = createEditorHarness('|**Bold**');

        try {
            const command = createClearFormattingCommand(harness.view);

            expect(command()).toBe(false);
            expect(harness.getText()).toBe('**Bold**');
        } finally {
            harness.destroy();
        }
    });

    test('clears multiple non-empty selections independently', () => {
        const harness = createEditorHarness(['**Bold**', '', '> ## [Label](https://example.com)'].join('\n'));

        try {
            const line1 = harness.view.state.doc.line(1);
            const line3 = harness.view.state.doc.line(3);

            harness.view.dispatch({
                selection: EditorSelection.create([
                    EditorSelection.range(line1.from, line1.to),
                    EditorSelection.range(line3.from, line3.to),
                ]),
            });

            const command = createClearFormattingCommand(harness.view);

            expect(command()).toBe(true);
            expect(harness.getText()).toBe(['Bold', '', 'https://example.com'].join('\n'));
            expect(
                harness.view.state.selection.ranges.map((range) =>
                    harness.view.state.doc.sliceString(range.from, range.to)
                )
            ).toEqual(['Bold', 'https://example.com']);
        } finally {
            harness.destroy();
        }
    });

    test('preserves reversed selection direction after replacing selected text', () => {
        const harness = createEditorHarness('**Bold**', { rawInput: true });

        try {
            harness.view.dispatch({
                selection: EditorSelection.create([EditorSelection.range(8, 0)]),
            });

            const command = createClearFormattingCommand(harness.view);

            expect(command()).toBe(true);
            expect(harness.getText()).toBe('Bold');
            expect(harness.getSelection()).toEqual({ anchor: 4, head: 0 });
        } finally {
            harness.destroy();
        }
    });
});
