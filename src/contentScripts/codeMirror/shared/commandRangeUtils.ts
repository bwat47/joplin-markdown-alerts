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

    return rangesOverlap(change, range);
}

/** Determines whether two ranges share at least one character. Touching ranges do not overlap. */
export function rangesOverlap(first: TextRange, second: TextRange): boolean {
    return first.from < second.to && first.to > second.from;
}
