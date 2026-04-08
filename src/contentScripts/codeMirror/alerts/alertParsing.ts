export const GITHUB_ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type GitHubAlertType = (typeof GITHUB_ALERT_TYPES)[number];

export type TextRange = { from: number; to: number };

export type ParsedGitHubAlertTitleLine =
    | {
          type: GitHubAlertType;
          /**
           * Character range (0-based, within the original line text) that corresponds
           * to the alert marker `[!TYPE]`.
           */
          markerRange: TextRange;
      }
    | {
          type: GitHubAlertType;
          title: string;
          /**
           * Character range (0-based, within the original line text) that corresponds
           * to the alert marker `[!TYPE]`.
           */
          markerRange: TextRange;
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
    // Match one-or-more blockquote markers (`>`), allowing optional whitespace after each.
    // This supports nested blockquotes like `>> [!NOTE]` and `> > [!NOTE]`.
    `^(\\s*(?:>\\s*)+)\\[!(${GITHUB_ALERT_TYPES.join('|')})\\](?:[ \\t]+(.*))?$`,
    'i'
);

export function parseGitHubAlertTitleLine(lineText: string): ParsedGitHubAlertTitleLine | null {
    const match = ALERT_TITLE_LINE_PATTERN.exec(lineText);

    if (!match) return null;

    const prefix = match[1];
    const typeText = match[2];
    const type = typeText.toLowerCase() as GitHubAlertType;

    const title = match[3]?.trim();

    const markerLength = `[!${typeText}]`.length;
    const markerRange: TextRange = {
        from: prefix.length,
        to: prefix.length + markerLength,
    };

    if (!title) return { type, markerRange };

    return { type, title, markerRange };
}
