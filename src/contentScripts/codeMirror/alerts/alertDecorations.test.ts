/** @vitest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { createAlertDecorationExtensions } from './alertDecorations';
import { createEditorHarness } from '../shared/testUtils';

const ALERT_DOC = '> [!NOTE]\n> Body line\n> > Nested line';
const BODY_LINE_START = ALERT_DOC.indexOf('> Body');

function createAlertHarness(cursor = BODY_LINE_START) {
    const harness = createEditorHarness(ALERT_DOC, {
        rawInput: true,
        extensions: [createAlertDecorationExtensions(false)],
    });
    harness.view.dispatch({ selection: EditorSelection.cursor(cursor) });
    return harness;
}

function getTitleLine(harness: ReturnType<typeof createAlertHarness>): Element {
    const titleLine = harness.view.contentDOM.querySelector('.cm-line.cm-gh-alert-title');
    if (!titleLine) throw new Error('Title line not decorated');
    return titleLine;
}

describe('alert decorations', () => {
    test('renders the title widget', () => {
        const harness = createAlertHarness();
        try {
            const titleLine = getTitleLine(harness);
            expect(titleLine.querySelector('.cm-gh-alert-title-widget')?.textContent).toBe('Note');
            expect(titleLine.querySelector('.cm-gh-alert-icon svg')).not.toBeNull();
            expect(titleLine.textContent).not.toContain('[!NOTE]');
        } finally {
            harness.destroy();
        }
    });

    test('shows the raw title syntax when the title line is selected', () => {
        const harness = createAlertHarness(0);
        try {
            const titleLine = getTitleLine(harness);
            expect(titleLine.querySelector('.cm-gh-alert-title-widget')).toBeNull();
            expect(titleLine.textContent).toBe('> [!NOTE]');
        } finally {
            harness.destroy();
        }
    });

    test('marks every blockquote marker in the alert', () => {
        const harness = createAlertHarness(0);
        try {
            const marks = [...harness.view.contentDOM.querySelectorAll('.cm-gh-alert-quote-mark')];
            expect(marks.map((mark) => mark.textContent)).toEqual(['>', '>', '>', '>']);
        } finally {
            harness.destroy();
        }
    });

    test('does not decorate plain blockquotes', () => {
        const harness = createEditorHarness('> plain quote', {
            rawInput: true,
            extensions: [createAlertDecorationExtensions(false)],
        });
        try {
            expect(harness.view.contentDOM.querySelector('.cm-gh-alert')).toBeNull();
            expect(harness.view.contentDOM.querySelector('.cm-gh-alert-quote-mark')).toBeNull();
        } finally {
            harness.destroy();
        }
    });
});
