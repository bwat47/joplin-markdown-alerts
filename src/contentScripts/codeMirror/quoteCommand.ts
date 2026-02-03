import type { EditorView } from '@codemirror/view';

const BLOCKQUOTE_PREFIX = '> ';
const BLOCKQUOTE_PREFIX_REGEX = /^>\s?/;

export function convertToBlockquoteText(text: string): string {
    return text
        .split('\n')
        .map((line) => `${BLOCKQUOTE_PREFIX}${line}`)
        .join('\n');
}

export function toggleBlockquoteText(text: string): string {
    const lines = text.split('\n');
    const allQuoted = lines.every((line) => BLOCKQUOTE_PREFIX_REGEX.test(line));

    if (allQuoted) {
        return lines.map((line) => line.replace(BLOCKQUOTE_PREFIX_REGEX, '')).join('\n');
    }

    return lines.map((line) => `${BLOCKQUOTE_PREFIX}${line}`).join('\n');
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
            const quoted = toggleBlockquoteText(text);

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
