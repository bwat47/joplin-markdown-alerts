import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from './alertParsing';
import {
    collectParagraphRanges,
    findParagraphNodeAt,
    getParagraphLineRange,
    getProbePositions,
    getSyntaxTree,
    type ParagraphRange,
} from './syntaxTreeUtils';

const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const DEFAULT_ALERT_TYPE = 'NOTE';
const BLOCKQUOTE_LINE_PREFIX = /^>\s?/;

function createAlertLine(prefix: string): string {
    return `${prefix}[!${DEFAULT_ALERT_TYPE}]`;
}

function isBlockquoteLine(line: string): boolean {
    return BLOCKQUOTE_PREFIX_PATTERN.test(line);
}

function getBlockquotePrefix(line: string): string | null {
    const match = BLOCKQUOTE_PREFIX_PATTERN.exec(line);
    return match ? match[1] : null;
}

function toggleAlertMarkerOnLine(view: EditorView, line: { from: number; text: string }): boolean {
    const alertInfo = parseGitHubAlertTitleLine(line.text);
    if (!alertInfo) {
        return false;
    }

    const currentIndex = GITHUB_ALERT_TYPES.indexOf(alertInfo.type);
    const nextIndex = (currentIndex + 1) % GITHUB_ALERT_TYPES.length;
    const nextTypeUpper = GITHUB_ALERT_TYPES[nextIndex].toUpperCase();

    const from = line.from + alertInfo.markerRange.from;
    const to = line.from + alertInfo.markerRange.to;

    view.dispatch({
        changes: { from, to, insert: `[!${nextTypeUpper}]` },
    });
    return true;
}

export function toggleAlertSelectionText(text: string): string {
    const lines = text.split('\n');
    const allQuoted = lines.every((line) => isBlockquoteLine(line));

    if (!allQuoted) {
        const quotedLines = lines.map((line) => `> ${line}`);
        return [createAlertLine('> '), ...quotedLines].join('\n');
    }

    const firstLine = lines[0];
    const alertInfo = parseGitHubAlertTitleLine(firstLine);
    if (alertInfo) {
        const currentIndex = GITHUB_ALERT_TYPES.indexOf(alertInfo.type);
        const nextIndex = (currentIndex + 1) % GITHUB_ALERT_TYPES.length;
        const nextTypeUpper = GITHUB_ALERT_TYPES[nextIndex].toUpperCase();

        const updatedFirstLine =
            firstLine.slice(0, alertInfo.markerRange.from) +
            `[!${nextTypeUpper}]` +
            firstLine.slice(alertInfo.markerRange.to);

        return [updatedFirstLine, ...lines.slice(1)].join('\n');
    }

    const prefix = getBlockquotePrefix(firstLine) ?? '> ';
    return [createAlertLine(prefix), ...lines].join('\n');
}

/**
 * Creates a command that inserts a new alert or toggles the type of an existing one.
 *
 * Behavior:
 * - If cursor is inside an existing alert blockquote, cycles to the next alert type
 * - If cursor is inside a regular blockquote, converts it to an alert
 * - Otherwise, inserts a new `> [!NOTE] ` at the cursor
 */
export function createInsertAlertCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);

        if (nonEmptyRanges.length > 0) {
            const expandedRangeMap = new Map<string, ParagraphRange>();
            for (const range of nonEmptyRanges) {
                const tree = getSyntaxTree(state, range.to);
                const paragraphRanges = collectParagraphRanges(state, tree, range.from, range.to);
                const baseFrom = state.doc.lineAt(range.from).from;
                const baseTo = state.doc.lineAt(range.to).to;
                const paragraphFrom = paragraphRanges.length > 0 ? paragraphRanges[0].from : baseFrom;
                const paragraphTo =
                    paragraphRanges.length > 0 ? paragraphRanges[paragraphRanges.length - 1].to : baseTo;
                const expandedRange = {
                    from: Math.min(baseFrom, paragraphFrom),
                    to: Math.max(baseTo, paragraphTo),
                };
                const key = `${expandedRange.from}:${expandedRange.to}`;
                if (!expandedRangeMap.has(key)) {
                    expandedRangeMap.set(key, expandedRange);
                }
            }

            const changes = Array.from(expandedRangeMap.values()).map((range) => {
                const text = state.doc.sliceString(range.from, range.to);
                const updated = toggleAlertSelectionText(text);

                return {
                    from: range.from,
                    to: range.to,
                    insert: updated,
                };
            });

            view.dispatch({ changes });
            return true;
        }

        const cursorPos = state.selection.main.head;
        const cursorLine = state.doc.lineAt(cursorPos);
        if (cursorLine.text.trim() === '') {
            const insertionText = `> [!${DEFAULT_ALERT_TYPE}] `;
            const selectionPos = cursorLine.from + insertionText.length;
            view.dispatch({
                changes: {
                    from: cursorLine.from,
                    to: cursorLine.to,
                    insert: insertionText,
                },
                selection: EditorSelection.single(selectionPos),
            });
            return true;
        }
        if (toggleAlertMarkerOnLine(view, cursorLine)) {
            return true;
        }
        const tree = getSyntaxTree(state, cursorPos);
        let outermostBlockquoteFrom: number | null = null;

        // Walk up ancestor nodes, preferring to toggle a blockquote whose first line
        // actually matches the GitHub alert marker syntax.
        for (const position of getProbePositions(state, cursorPos, BLOCKQUOTE_LINE_PREFIX)) {
            let node: SyntaxNode | null = tree.resolveInner(position, -1);
            while (node) {
                if (node.name.toLowerCase() === 'blockquote') {
                    outermostBlockquoteFrom = node.from;

                    const blockquoteStartLine = state.doc.lineAt(node.from);
                    if (toggleAlertMarkerOnLine(view, blockquoteStartLine)) {
                        return true;
                    }
                }

                node = node.parent;
            }
        }

        if (outermostBlockquoteFrom !== null) {
            // Convert standard blockquote to alert by inserting a new marker line above.
            const blockquoteStartLine = state.doc.lineAt(outermostBlockquoteFrom);
            const match = BLOCKQUOTE_PREFIX_PATTERN.exec(blockquoteStartLine.text);
            if (match) {
                const insertionPoint = blockquoteStartLine.from;
                const insertionText = `${createAlertLine(match[1])}\n`;
                view.dispatch({
                    changes: { from: insertionPoint, insert: insertionText },
                });
                return true;
            }
        }

        const paragraphNode = findParagraphNodeAt(state, tree, cursorPos, BLOCKQUOTE_LINE_PREFIX);
        if (paragraphNode) {
            const paragraphRange = getParagraphLineRange(state, paragraphNode);
            const text = state.doc.sliceString(paragraphRange.from, paragraphRange.to);
            const updated = toggleAlertSelectionText(text);

            view.dispatch({
                changes: {
                    from: paragraphRange.from,
                    to: paragraphRange.to,
                    insert: updated,
                },
            });
            return true;
        }

        const fallbackLine = state.doc.lineAt(cursorPos);
        const updated = toggleAlertSelectionText(fallbackLine.text);
        view.dispatch({
            changes: {
                from: fallbackLine.from,
                to: fallbackLine.to,
                insert: updated,
            },
        });
        return true;
    };
}
