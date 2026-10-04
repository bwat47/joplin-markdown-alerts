/** @vitest-environment jsdom */
import { EditorSelection } from '@codemirror/state';

import { createAlertDecorationExtensions } from './alertDecorations';
import {
    type MarkdownAlertEditorSettings,
    applyMarkdownAlertEditorSettings,
    createMarkdownAlertEditorSettingsExtension,
} from '../pluginSettings';
import { createEditorHarness } from '../shared/testUtils';

const ALERT_DOC = '> [!NOTE]\n> Body line\n> > Nested line';
const BODY_LINE_START = ALERT_DOC.indexOf('> Body');

const DEFAULT_TEST_SETTINGS: MarkdownAlertEditorSettings = {
    enableAlertAutocomplete: false,
    renderAlertTitles: true,
    showAlertBackground: true,
};

function createAlertHarness(settings: Partial<MarkdownAlertEditorSettings> = {}, cursor = BODY_LINE_START) {
    const harness = createEditorHarness(ALERT_DOC, {
        rawInput: true,
        extensions: [
            createMarkdownAlertEditorSettingsExtension({ ...DEFAULT_TEST_SETTINGS, ...settings }),
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
        const harness = createAlertHarness({}, 0);
        try {
            const titleLine = getTitleLine(harness);
            expect(titleLine.querySelector('.cm-gh-alert-title-widget')).toBeNull();
            expect(titleLine.textContent).toBe('> [!NOTE]');
        } finally {
            harness.destroy();
        }
    });

    test('shows the raw title syntax with alert styling when title rendering is disabled', () => {
        const harness = createAlertHarness({ renderAlertTitles: false });
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
        const harness = createAlertHarness();
        try {
            applyMarkdownAlertEditorSettings(harness.view, { ...DEFAULT_TEST_SETTINGS, renderAlertTitles: false });
            expect(getTitleLine(harness).querySelector('.cm-gh-alert-title-widget')).toBeNull();
        } finally {
            harness.destroy();
        }
    });

    test('marks every blockquote marker in the alert', () => {
        const harness = createAlertHarness({ renderAlertTitles: false });
        try {
            const marks = [...harness.view.contentDOM.querySelectorAll('.cm-gh-alert-quote-mark')];
            expect(marks.map((mark) => mark.textContent)).toEqual(['>', '>', '>', '>']);
        } finally {
            harness.destroy();
        }
    });

    test('marks alert lines for a transparent background when the background setting is disabled', () => {
        const harness = createAlertHarness({ showAlertBackground: false });
        try {
            const alertLines = harness.view.contentDOM.querySelectorAll('.cm-line.cm-gh-alert');
            const noBackgroundLines = harness.view.contentDOM.querySelectorAll('.cm-line.cm-gh-alert-no-bg');
            expect(alertLines).toHaveLength(3);
            expect(noBackgroundLines).toHaveLength(alertLines.length);
        } finally {
            harness.destroy();
        }
    });

    test('keeps the alert background by default', () => {
        const harness = createAlertHarness();
        try {
            expect(harness.view.contentDOM.querySelector('.cm-gh-alert-no-bg')).toBeNull();
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
