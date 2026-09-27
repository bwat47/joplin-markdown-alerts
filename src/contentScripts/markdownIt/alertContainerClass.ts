const ALERT_CLASS_PREFIX = 'markdown-alert';

/** Added to rendered alert containers when alert background colors are disabled. */
export const ALERT_NO_BACKGROUND_CLASS = `${ALERT_CLASS_PREFIX}-no-bg`;

/**
 * Matches the opening alert container rendered by `markdown-it-github-alerts`.
 *
 * Example: `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">...`
 */
const ALERT_CONTAINER_OPEN_PATTERN = new RegExp(`^<div class="${ALERT_CLASS_PREFIX} `);

/**
 * Adds a class to the rendered alert container's opening tag. Returns the HTML unchanged if it
 * does not start with the expected alert container.
 */
export function addAlertContainerClass(html: string, className: string): string {
    return html.replace(ALERT_CONTAINER_OPEN_PATTERN, (openTag) => `${openTag}${className} `);
}
