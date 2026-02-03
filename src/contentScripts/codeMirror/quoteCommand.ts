import type { EditorView } from '@codemirror/view';

const BLOCKQUOTE_PREFIX = '> ';

export function convertToBlockquoteText(text: string): string {
    return text
        .split('\n')
        .map((line) => `${BLOCKQUOTE_PREFIX}${line}`)
        .join('\n');
}

export function createQuoteSelectionCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);

        if (nonEmptyRanges.length === 0) {
            return false;
        }

        const changes = nonEmptyRanges.map((range) => {
            const text = state.doc.sliceString(range.from, range.to);
            const quoted = convertToBlockquoteText(text);

            return {
                from: range.from,
                to: range.to,
                insert: quoted,
            };
        });

        view.dispatch({ changes });
        return true;
    };
}
