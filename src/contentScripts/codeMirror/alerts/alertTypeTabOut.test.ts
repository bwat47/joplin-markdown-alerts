// @vitest-environment jsdom
import { autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';

import { createInsertAlertCommand } from '../commands/insertAlertCommand';
import { createEditorHarness } from '../shared/testUtils';
import { tabOutOfAlertType } from './alertTypeTabOut';

function getSelections(harness: ReturnType<typeof createEditorHarness>): Array<{ anchor: number; head: number }> {
    return harness.view.state.selection.ranges.map((range) => ({ anchor: range.anchor, head: range.head }));
}

describe('tabOutOfAlertType', () => {
    test.each([
        {
            name: 'moves past the selected type to the end of an empty alert line',
            input: '> [![[NOTE]]] ',
            expectedCursor: '> [!NOTE] '.length,
        },
        {
            name: 'moves to the end of the title line when the alert has a title',
            input: ['> [![[warning]]] Custom title', '> Body'].join('\n'),
            expectedCursor: '> [!warning] Custom title'.length,
        },
        {
            name: 'moves to the end of a nested alert title line',
            input: ['> > [![[TIP]]]', '> > Body'].join('\n'),
            expectedCursor: '> > [!TIP]'.length,
        },
    ])('$name', ({ input, expectedCursor }) => {
        const harness = createEditorHarness(input);

        try {
            expect(tabOutOfAlertType(harness.view)).toBe(true);
            expect(getSelections(harness)).toEqual([{ anchor: expectedCursor, head: expectedCursor }]);
        } finally {
            harness.destroy();
        }
    });

    test.each([
        { name: 'cursor is on an alert title line', input: '> [!NO|TE]' },
        { name: 'selection covers only part of the type', input: '> [!N[[OT]]E]' },
        { name: 'selection includes the marker brackets', input: '> [[[!NOTE]]]' },
        { name: 'selection is text that is not an alert type', input: '> [[Note]] text' },
        { name: 'type-like text is not on an alert title line', input: '[![[NOTE]]]' },
    ])('does not handle Tab when $name', ({ input }) => {
        const harness = createEditorHarness(input);

        try {
            const selectionBefore = getSelections(harness);
            expect(tabOutOfAlertType(harness.view)).toBe(false);
            expect(getSelections(harness)).toEqual(selectionBefore);
        } finally {
            harness.destroy();
        }
    });

    test('moves every cursor when each selection is an alert type', () => {
        const harness = createEditorHarness(['> [!NOTE] ', '', '> [!TIP] Title'].join('\n'));

        try {
            harness.view.dispatch({
                selection: EditorSelection.create([EditorSelection.range(4, 8), EditorSelection.range(16, 19)]),
            });

            expect(tabOutOfAlertType(harness.view)).toBe(true);
            expect(getSelections(harness)).toEqual([
                { anchor: 10, head: 10 },
                { anchor: 26, head: 26 },
            ]);
        } finally {
            harness.destroy();
        }
    });

    test('does not handle Tab when any selection is not an alert type', () => {
        const harness = createEditorHarness(['> [!NOTE] ', '', 'Plain text'].join('\n'));

        try {
            harness.view.dispatch({
                selection: EditorSelection.create([EditorSelection.range(4, 8), EditorSelection.range(12, 17)]),
            });

            expect(tabOutOfAlertType(harness.view)).toBe(false);
        } finally {
            harness.destroy();
        }
    });

    test('moves past the type selected by the insert alert command', () => {
        const harness = createEditorHarness('Some [[selected]] text');

        try {
            createInsertAlertCommand(harness.view)();

            expect(tabOutOfAlertType(harness.view)).toBe(true);
            expect(harness.getText()).toBe(['> [!NOTE]', '> Some selected text'].join('\n'));
            expect(harness.getCursor()).toBe('> [!NOTE]'.length);
        } finally {
            harness.destroy();
        }
    });

    test('defers to autocomplete while the completion popup is open', async () => {
        const COMPLETION_START_TIMEOUT_MS = 250;
        const COMPLETION_POLL_INTERVAL_MS = 10;
        const harness = createEditorHarness('> [![[NOTE]]] ', {
            extensions: [
                autocompletion({
                    override: [(context) => ({ from: context.pos, options: [{ label: 'option' }] })],
                    activateOnTyping: false,
                    interactionDelay: 0,
                }),
            ],
        });

        try {
            startCompletion(harness.view);
            const deadline = Date.now() + COMPLETION_START_TIMEOUT_MS;
            while (completionStatus(harness.view.state) !== 'active' && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, COMPLETION_POLL_INTERVAL_MS));
            }
            expect(completionStatus(harness.view.state)).toBe('active');

            expect(tabOutOfAlertType(harness.view)).toBe(false);
            expect(getSelections(harness)).toEqual([{ anchor: 4, head: 8 }]);
        } finally {
            harness.destroy();
        }
    });
});
