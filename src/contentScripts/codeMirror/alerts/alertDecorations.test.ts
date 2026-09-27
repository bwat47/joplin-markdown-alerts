/** @vitest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { createAlertDecorationExtensions } from './alertDecorations';
import { applyMarkdownAlertEditorSettings, createMarkdownAlertEditorSettingsExtension } from '../pluginSettings';
import { createEditorHarness } from '../shared/testUtils';

const ALERT_DOC = '> [!NOTE]\n> Body line\n> > Nested line';
const BODY_LINE_START = ALERT_DOC.indexOf('> Body');

function createAlertHarness(renderAlertTitles: boolean, cursor = BODY_LINE_START) {
    const harness = createEditorHarness(ALERT_DOC, {
        rawInput: true,
        extensions: [
            createMarkdownAlertEditorSettingsExtension({ enableAlertAutocomplete: false, renderAlertTitles }),
            createAlertDecorationExtensions(false),
        ],
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
    test('renders the title widget when title rendering is enabled', () => {
        const harness = createAlertHarness(true);
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
        const harness = createAlertHarness(true, 0);
        try {
            const titleLine = getTitleLine(harness);
            expect(titleLine.querySelector('.cm-gh-alert-title-widget')).toBeNull();
            expect(titleLine.textContent).toBe('> [!NOTE]');
        } finally {
            harness.destroy();
        }
    });

    test('shows the raw title syntax with alert styling when title rendering is disabled', () => {
        const harness = createAlertHarness(false);
        try {
            const titleLine = getTitleLine(harness);
            expect(titleLine.classList.contains('cm-gh-alert-note')).toBe(true);
            expect(titleLine.querySelector('.cm-gh-alert-title-widget')).toBeNull();
            expect(titleLine.querySelector('.cm-gh-alert-icon')).toBeNull();
            expect(titleLine.textContent).toBe('> [!NOTE]');
        } finally {
            harness.destroy();
        }
    });

    test('updates title rendering when the setting is reconfigured', () => {
        const harness = createAlertHarness(true);
        try {
            applyMarkdownAlertEditorSettings(harness.view, {
                enableAlertAutocomplete: false,
                renderAlertTitles: false,
            });
            expect(getTitleLine(harness).querySelector('.cm-gh-alert-title-widget')).toBeNull();
        } finally {
            harness.destroy();
        }
    });

    test('marks every blockquote marker in the alert', () => {
        const harness = createAlertHarness(false);
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
            extensions: [createMarkdownAlertEditorSettingsExtension(), createAlertDecorationExtensions(false)],
        });
        try {
            expect(harness.view.contentDOM.querySelector('.cm-gh-alert')).toBeNull();
            expect(harness.view.contentDOM.querySelector('.cm-gh-alert-quote-mark')).toBeNull();
        } finally {
            harness.destroy();
        }
    });
});
