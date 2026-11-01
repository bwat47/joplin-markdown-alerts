import { completionStatus } from '@codemirror/autocomplete';
import {
    EditorSelection,
    Prec,
    type ChangeSpec,
    type EditorState,
    type Extension,
    type TransactionSpec,
} from '@codemirror/state';
import { keymap, type Command } from '@codemirror/view';

import { getAlertTypeRange, parseGitHubAlertTitleLine } from './alertParsing';

const TAB_KEY = 'Tab';
// Matches the trailing space the alert autocomplete inserts after `[!TYPE]`.
const MARKER_TRAILING_SPACE = ' ';

/**
 * Builds the Tab-out transaction when every selection range is exactly the alert type of a
 * title line (e.g. `NOTE` in `> [!NOTE] Title`), otherwise returns `null`.
 *
 * Each cursor moves to the end of its title line. A line that ends right at the marker
 * (`> [!NOTE]`) gets a trailing space first, so the cursor lands one space after the marker,
 * matching where autocomplete leaves it.
 */
function getAlertTypeTabOutSpec(state: EditorState): TransactionSpec | null {
    const changes: ChangeSpec[] = [];
    const cursorPositions: number[] = [];

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

        if (alertInfo.markerRange.to === line.length) {
            changes.push({ from: line.to, insert: MARKER_TRAILING_SPACE });
        }
        cursorPositions.push(line.to);
    }

    const changeSet = state.changes(changes);
    // Map with assoc 1 so a cursor at an inserted space lands after it.
    const cursors = cursorPositions.map((pos) => EditorSelection.cursor(changeSet.mapPos(pos, 1)));

    return {
        changes: changeSet,
        selection: EditorSelection.create(cursors, state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: changes.length > 0 ? 'input' : 'select',
    };
}

/**
 * Moves each cursor past a selected alert type to the end of its title line.
 * Defers to autocomplete while its popup is open so Tab keeps its completion behavior.
 */
export const tabOutOfAlertType: Command = (view) => {
    if (completionStatus(view.state) === 'active') {
        return false;
    }

    const spec = getAlertTypeTabOutSpec(view.state);
    if (!spec) {
        return false;
    }

    view.dispatch(spec);
    return true;
};

/**
 * Binds Tab to {@link tabOutOfAlertType} ahead of the editor's default Tab handling (indentation).
 */
export function createAlertTypeTabOutExtension(): Extension {
    return Prec.highest(keymap.of([{ key: TAB_KEY, run: tabOutOfAlertType }]));
}
