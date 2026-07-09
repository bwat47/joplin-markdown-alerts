import { changeOverlapsRange } from './commandRangeUtils';

describe('changeOverlapsRange', () => {
    const range = { from: 4, to: 8 };

    test.each([
        [{ from: 4, to: 4 }, true],
        [{ from: 8, to: 8 }, true],
        [{ from: 3, to: 3 }, false],
        [{ from: 9, to: 9 }, false],
        [{ from: 3, to: 5 }, true],
        [{ from: 7, to: 9 }, true],
        [{ from: 3, to: 4 }, false],
        [{ from: 8, to: 9 }, false],
    ])('reports %o as %s', (change, expected) => {
        expect(changeOverlapsRange(change, range)).toBe(expected);
    });
});
