import { ChangeSet, EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

export type ExplicitCursorSelection = {
    anchorBasePos: number;
    anchorOffset: number;
    headBasePos: number;
    headOffset: number;
};

function sortChanges(changes: TextChange[]): TextChange[] {
    return [...changes].sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
}

export function dispatchChangesWithSelections(
    view: EditorView,
    changes: TextChange[],
    explicitSelectionsByIndex?: Map<number, ExplicitCursorSelection>
): void {
    const sortedChanges = sortChanges(changes);

    if (!explicitSelectionsByIndex || explicitSelectionsByIndex.size === 0) {
        view.dispatch({ changes: sortedChanges });
        return;
    }

    const state = view.state;
    const changeSet = ChangeSet.of(sortedChanges, state.doc.length);
    const selectionRanges = state.selection.ranges.map((range, index) => {
        const explicitSelection = explicitSelectionsByIndex.get(index);
        const anchor = explicitSelection
            ? changeSet.mapPos(explicitSelection.anchorBasePos, -1) + explicitSelection.anchorOffset
            : changeSet.mapPos(range.anchor, 1);
        const head = explicitSelection
            ? changeSet.mapPos(explicitSelection.headBasePos, -1) + explicitSelection.headOffset
            : changeSet.mapPos(range.head, 1);

        return EditorSelection.range(anchor, head);
    });

    view.dispatch({
        changes: sortedChanges,
        selection: EditorSelection.create(selectionRanges, state.selection.mainIndex),
    });
}
