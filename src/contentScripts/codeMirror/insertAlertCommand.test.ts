import { toggleAlertSelectionText } from './insertAlertCommand';

describe('toggleAlertSelectionText', () => {
    test('adds an alert line and quotes when selection is not a blockquote', () => {
        const input = ['Line one', 'Line two'].join('\n');
        const expected = ['> [!NOTE]', '> Line one', '> Line two'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('inserts alert line above quoted selection without an alert marker', () => {
        const input = ['> Line one', '> Line two'].join('\n');
        const expected = ['> [!NOTE]', '> Line one', '> Line two'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('preserves nested blockquote prefix when inserting alert line', () => {
        const input = ['>> Nested line', '>> Another line'].join('\n');
        const expected = ['>> [!NOTE]', '>> Nested line', '>> Another line'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('toggles alert type when selection already includes alert marker', () => {
        const input = ['> [!NOTE]', '> Line one'].join('\n');
        const expected = ['> [!TIP]', '> Line one'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });

    test('toggles alert type while preserving the title text', () => {
        const input = ['> [!warning] Custom title', '> Line one'].join('\n');
        const expected = ['> [!CAUTION] Custom title', '> Line one'].join('\n');

        expect(toggleAlertSelectionText(input)).toBe(expected);
    });
});
