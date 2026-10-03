/** @vitest-environment jsdom */
import { StateEffect, type Extension } from '@codemirror/state';
import type { CodeMirrorControl, ContentScriptContext } from 'api/types';

import createContentScript from './contentScript';
import { getMarkdownAlertEditorSettings } from './pluginSettings';
import { createEditorHarness } from './shared/testUtils';
import { logger } from '../../logger';

function createEditorControl(harness: ReturnType<typeof createEditorHarness>): CodeMirrorControl {
    return {
        editor: harness.view,
        cm6: harness.view,
        addExtension(extension: Extension): void {
            harness.view.dispatch({ effects: StateEffect.appendConfig.of(extension) });
        },
        registerCommand: vi.fn(),
        supportsCommand: () => false,
        execCommand: vi.fn(),
        joplinExtensions: {
            completionSource: vi.fn(() => []),
            enableLanguageDataAutocomplete: { of: () => [] },
            noteIdFacet: undefined,
            setNoteIdEffect: undefined,
        },
    };
}

function createContext(postMessage: ContentScriptContext['postMessage']): ContentScriptContext {
    return { pluginId: 'test', contentScriptId: 'test.codeMirror', postMessage };
}

describe('CodeMirror content script initialization', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('returns synchronously and applies settings once the message resolves', async () => {
        const harness = createEditorHarness('> [!NOTE]\n> Body');
        const control = createEditorControl(harness);
        const settings = { enableAlertAutocomplete: true, renderAlertTitles: false, showAlertBackground: true };
        let resolveSettings: (value: unknown) => void = () => {};
        const response = new Promise<unknown>((resolve) => {
            resolveSettings = resolve;
        });
        const context = createContext(vi.fn(() => response));

        try {
            expect(createContentScript(context).plugin(control)).toBeUndefined();
            expect(getMarkdownAlertEditorSettings(harness.view.state).showAlertBackground).toBe(false);
            resolveSettings(settings);
            await vi.waitFor(() => {
                expect(getMarkdownAlertEditorSettings(harness.view.state)).toEqual(settings);
            });
        } finally {
            harness.destroy();
        }
    });

    test('uses enabled defaults when fetching settings fails', async () => {
        const harness = createEditorHarness('Text');
        const error = new Error('Message failed');
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const context = createContext(vi.fn().mockRejectedValue(error));

        try {
            createContentScript(context).plugin(createEditorControl(harness));
            await vi.waitFor(() => {
                expect(getMarkdownAlertEditorSettings(harness.view.state)).toEqual({
                    enableAlertAutocomplete: true,
                    renderAlertTitles: true,
                    showAlertBackground: true,
                });
            });
            expect(warn).toHaveBeenCalledWith('Failed to fetch editor settings; defaulting to enabled.', error);
        } finally {
            harness.destroy();
        }
    });

    test('logs initialization failures without returning an unhandled promise to Joplin', async () => {
        const harness = createEditorHarness('Text');
        const control = createEditorControl(harness);
        const error = new Error('Extension failed');
        control.addExtension = vi.fn(() => {
            throw error;
        });
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const context = createContext(vi.fn().mockResolvedValue(null));

        try {
            expect(createContentScript(context).plugin(control)).toBeUndefined();
            await vi.waitFor(() => {
                expect(logError).toHaveBeenCalledWith('Failed to initialize Markdown Alerts editor extensions.', error);
            });
            expect(context.postMessage).not.toHaveBeenCalled();
        } finally {
            harness.destroy();
        }
    });
});
