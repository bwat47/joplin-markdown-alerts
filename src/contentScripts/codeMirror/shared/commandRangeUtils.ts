export type TextRange = {
    from: number;
    to: number;
};

/**
 * Determines whether a document change affects a range.
 *
 * Insertions at either range boundary are treated as overlapping so a cursor
 * insertion cannot conflict with an adjacent selected range.
 */
export function changeOverlapsRange(change: TextRange, range: TextRange): boolean {
    if (change.from === change.to) {
        return change.from >= range.from && change.from <= range.to;
    }

    return change.from < range.to && change.to > range.from;
}
