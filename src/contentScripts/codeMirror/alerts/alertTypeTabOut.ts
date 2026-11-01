import { completionStatus } from '@codemirror/autocomplete';
import { EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command } from '@codemirror/view';

import { getAlertTypeRange, parseGitHubAlertTitleLine } from './alertParsing';

const TAB_KEY = 'Tab';

/**
 * Returns cursors at the end of each alert title line when every selection range is exactly
 * the alert type of a title line (e.g. `NOTE` in `> [!NOTE] Title`), otherwise `null`.
 */
function getAlertTypeTabOutSelection(state: EditorState): EditorSelection | null {
    const cursors = [];

    for (const range of state.selection.ranges) {
        if (range.empty) {
            return null;
        }

        const line = state.doc.lineAt(range.from);
        const alertInfo = parseGitHubAlertTitleLine(line.text);
        if (!alertInfo) {
            return null;
        }

        const typeRange = getAlertTypeRange(alertInfo.markerRange);
        if (range.from !== line.from + typeRange.from || range.to !== line.from + typeRange.to) {
            return null;
        }

        cursors.push(EditorSelection.cursor(line.to));
    }

    return EditorSelection.create(cursors, state.selection.mainIndex);
}

/**
 * Moves each cursor past a selected alert type to the end of its title line.
 * Defers to autocomplete while its popup is open so Tab keeps its completion behavior.
 */
export const tabOutOfAlertType: Command = (view) => {
    if (completionStatus(view.state) === 'active') {
        return false;
    }

    const selection = getAlertTypeTabOutSelection(view.state);
    if (!selection) {
        return false;
    }

    view.dispatch({ selection, scrollIntoView: true, userEvent: 'select' });
    return true;
};

/**
 * Binds Tab to {@link tabOutOfAlertType} ahead of the editor's default Tab handling (indentation).
 */
export function createAlertTypeTabOutExtension(): Extension {
    return Prec.highest(keymap.of([{ key: TAB_KEY, run: tabOutOfAlertType }]));
}
