/** @jest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { clearMarkdownFormattingSelectionText, createClearFormattingCommand } from './clearFormattingCommand';
import { createEditorHarness } from './testUtils';

const RESOURCE_ID = ':/5622253ddc404beaa9becd86d48095c5';

describe('clearMarkdownFormattingSelectionText', () => {
    test('removes supported inline markdown formatting markers', () => {
        const input = '**_Bold Italic_** ~~Strike~~ ==Highlight== ++Underline++ ^Sup^ ~Sub~';
        const expected = 'Bold Italic Strike Highlight Underline Sup Sub';

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('does not rewrite literal text that matches the old printable placeholder format', () => {
        const input = '@@MDCLR0@@ [Link](https://example.com)';
        const expected = '@@MDCLR0@@ https://example.com';

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes heading and blockquote markers without breaking table pipes', () => {
        const input = ['> ## **Title**', '| **A** | [B](https://example.com/path) |'].join('\n');
        const expected = ['Title', '| A | https://example.com/path |'].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes numbered, nested, and task list markers', () => {
        const input = ['1. **Item**', '  - - _Sub-item_', '- [ ] ~~Task~~', '  1. [x] ++Done++'].join('\n');
        const expected = ['Item', 'Sub-item', 'Task', 'Done'].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('extracts external markdown and html image destinations while preserving Joplin resources', () => {
        const input = [
            '[Joplin Cloud](https://joplinapp.org/plans/)',
            '![External](https://example.com/image.png)',
            '![Alt][https://examples.com/image.png]',
            `![Resource](${RESOURCE_ID})`,
            '<img src="https://example.com/external.png" alt="External">',
            `<img src="${RESOURCE_ID}" alt="Resource">`,
        ].join('\n');
        const expected = [
            'https://joplinapp.org/plans/',
            'https://example.com/image.png',
            'Alt https://examples.com/image.png',
            `![Resource](${RESOURCE_ID})`,
            'https://example.com/external.png',
            `<img src="${RESOURCE_ID}" alt="Resource">`,
        ].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes reference-link and footnote syntax from selected text', () => {
        const input = [
            'Link to [Case Test][UpPeR] and ref [^1]',
            '[^1]: Footnote1',
            '[UpPeR]: https://example.com/reference',
        ].join('\n');
        const expected = ['Link to Case Test and ref 1', 'Footnote1', 'https://example.com/reference'].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes code markers while preserving literal markdown inside code content', () => {
        const input = ['`**bold**`', '```ts', '**literal**', '[link](https://example.com)', '```'].join('\n');
        const expected = ['**bold**', '**literal**', '[link](https://example.com)'].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes supported html formatting tags', () => {
        const input = '<sup>Sup</sup> <sub>Sub</sub> <strong>Bold</strong> <em>Italic</em>';
        const expected = 'Sup Sub Bold Italic';

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes GitHub alert marker lines and keeps custom titles', () => {
        const input = ['> [!NOTE]', '> body', '> [!WARNING] Custom title', '> **bold** body'].join('\n');
        const expected = ['', 'body', 'Custom title', 'bold body'].join('\n');

        expect(clearMarkdownFormattingSelectionText(input)).toBe(expected);
    });

    test('removes plain alert marker lines without blockquote prefixes', () => {
        const input = ['[!TIP]', '[!IMPORTANT] Optional title'].join('\n');
        const expected = ['', 'Optional title'].join('\n');

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
});
