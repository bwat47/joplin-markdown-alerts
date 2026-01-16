export const GITHUB_ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type GitHubAlertType = (typeof GITHUB_ALERT_TYPES)[number];

export type TextRange = { from: number; to: number };

export type ParsedGitHubAlertTitleLine =
    | {
          type: GitHubAlertType;
      }
    | {
          type: GitHubAlertType;
          title: string;
          /**
           * Character range (0-based, within the original line text) that corresponds
           * to the alert marker plus the whitespace that follows it, suitable for
           * hiding when a custom title is present.
           */
          markerHideRange: TextRange;
      };

/**
 * Parses a GitHub alert title line.
 *
 * Examples:
 * - `> [!NOTE]`
 * - `> [!warning] Optional title`
 * - `   >    [!Tip]`
 */
const ALERT_TITLE_LINE_PATTERN = new RegExp(
    `^(\\s*>\\s*)\\[!(${GITHUB_ALERT_TYPES.join('|')})\\](?:([ \\t]+)(.*))?$`,
    'i'
);

export function parseGitHubAlertTitleLine(lineText: string): ParsedGitHubAlertTitleLine | null {
    const match = ALERT_TITLE_LINE_PATTERN.exec(lineText);

    if (!match) return null;

    const prefix = match[1];
    const typeText = match[2];
    const type = typeText.toLowerCase() as GitHubAlertType;

    const whitespaceAfterMarker = match[3] ?? '';
    const title = match[4]?.trim();

    if (!title) return { type };

    const markerLength = `[!${typeText}]`.length + whitespaceAfterMarker.length;
    const markerHideRange: TextRange = {
        from: prefix.length,
        to: prefix.length + markerLength,
    };

    return { type, title, markerHideRange };
}
