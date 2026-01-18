import { parseGitHubAlertTitleLine } from './alertParsing';

describe('parseGitHubAlertTitleLine', () => {
    test('returns null for non-alert lines', () => {
        expect(parseGitHubAlertTitleLine('[!NOTE] Title')).toBeNull();
        expect(parseGitHubAlertTitleLine('> [NOTE] Title')).toBeNull();
        expect(parseGitHubAlertTitleLine('> [!unknown] Title')).toBeNull();
    });

    test('parses type-only title line', () => {
        const line = '> [!NOTE]';
        const parsed = parseGitHubAlertTitleLine(line);
        expect(parsed).toMatchObject({
            type: 'note',
            markerRange: { from: 2, to: 9 },
        });
        if (!parsed) throw new Error('Expected parsed result');
        expect(line.slice(parsed.markerRange.from, parsed.markerRange.to)).toBe('[!NOTE]');
    });

    test('parses title line with custom title (case-insensitive type)', () => {
        const line = '> [!warning] Optional title';
        const parsed = parseGitHubAlertTitleLine(line);

        expect(parsed).not.toBeNull();
        expect(parsed && 'title' in parsed).toBe(true);

        if (!parsed || !('title' in parsed)) throw new Error('Expected a titled alert result');

        expect(parsed.type).toBe('warning');
        expect(parsed.title).toBe('Optional title');
        expect(line.slice(parsed.markerHideRange.from, parsed.markerHideRange.to)).toBe('[!warning] ');
    });

    test('preserves marker length using original type casing', () => {
        const line = '> [!Tip] My title';
        const parsed = parseGitHubAlertTitleLine(line);

        if (!parsed || !('title' in parsed)) throw new Error('Expected a titled alert result');

        expect(parsed.type).toBe('tip');
        expect(parsed.title).toBe('My title');
        expect(line.slice(parsed.markerHideRange.from, parsed.markerHideRange.to)).toBe('[!Tip] ');
    });

    test('markerHideRange includes whitespace after marker', () => {
        const line = '   >    [!NOTE]   Title';
        const parsed = parseGitHubAlertTitleLine(line);

        if (!parsed || !('title' in parsed)) throw new Error('Expected a titled alert result');

        expect(parsed.type).toBe('note');
        expect(parsed.title).toBe('Title');
        expect(line.slice(parsed.markerHideRange.from, parsed.markerHideRange.to)).toBe('[!NOTE]   ');
    });
});
