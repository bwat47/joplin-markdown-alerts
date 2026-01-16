export const GITHUB_ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type GitHubAlertType = (typeof GITHUB_ALERT_TYPES)[number];

/**
 * Parses a GitHub alert title line.
 *
 * Examples:
 * - `> [!NOTE]`
 * - `> [!warning] Optional title`
 * - `   >    [!Tip]`
 */
const ALERT_TYPE_PATTERN = new RegExp(`^\\s*>\\s*\\[!(${GITHUB_ALERT_TYPES.join('|')})\\](?:[ \\t]+(.*))?$`, 'i');

export function parseGitHubAlertTitleLine(lineText: string): { type: GitHubAlertType; title?: string } | null {
    const match = ALERT_TYPE_PATTERN.exec(lineText);

    if (!match) return null;

    const type = match[1].toLowerCase() as GitHubAlertType;
    const title = match[2]?.trim();

    return title ? { type, title } : { type };
}
