import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from './alertParsing';

const SYNTAX_TREE_TIMEOUT = 100;
const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const DEFAULT_ALERT_TYPE = 'NOTE';

type ParagraphRange = {
    from: number;
    to: number;
};

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

function findParagraphNodeAt(state: EditorState, tree: ReturnType<typeof syntaxTree>, position: number): SyntaxNode | null {
    const docLength = state.doc.length;
    const positions = [position, position - 1, position + 1]
        .map((pos) => Math.min(Math.max(pos, 0), docLength))
        .filter((pos, index, list) => list.indexOf(pos) === index);

    for (const probePosition of positions) {
        let node: SyntaxNode | null = tree.resolveInner(probePosition, -1);
        while (node) {
            if (node.name.toLowerCase() === 'paragraph') {
                return node;
            }
            node = node.parent;
        }

        node = tree.resolveInner(probePosition, 1);
        while (node) {
            if (node.name.toLowerCase() === 'paragraph') {
                return node;
            }
            node = node.parent;
        }
    }

    return null;
}

function getParagraphLineRange(state: EditorState, node: SyntaxNode): ParagraphRange {
    const startLine = state.doc.lineAt(node.from);
    const endPos = Math.max(node.from, node.to - 1);
    const endLine = state.doc.lineAt(endPos);
    return { from: startLine.from, to: endLine.to };
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
            const changes = nonEmptyRanges.map((range) => {
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

        // Ensure the syntax tree is available before resolving nodes.
        // If this times out, fall back to whatever tree is currently available.
        let tree = ensureSyntaxTree(state, cursorPos, SYNTAX_TREE_TIMEOUT);
        if (!tree) {
            tree = syntaxTree(state);
        }
        let node: SyntaxNode | null = tree.resolveInner(cursorPos, -1);

        let outermostBlockquoteFrom: number | null = null;

        // Walk up ancestor nodes, preferring to toggle a blockquote whose first line
        // actually matches the GitHub alert marker syntax.
        while (node) {
            if (node.name.toLowerCase() === 'blockquote') {
                outermostBlockquoteFrom = node.from;

                const blockquoteStartLine = state.doc.lineAt(node.from);
                const alertInfo = parseGitHubAlertTitleLine(blockquoteStartLine.text);

                if (alertInfo) {
                    const currentIndex = GITHUB_ALERT_TYPES.indexOf(alertInfo.type);
                    const nextIndex = (currentIndex + 1) % GITHUB_ALERT_TYPES.length;
                    const nextTypeUpper = GITHUB_ALERT_TYPES[nextIndex].toUpperCase();

                    const from = blockquoteStartLine.from + alertInfo.markerRange.from;
                    const to = blockquoteStartLine.from + alertInfo.markerRange.to;

                    view.dispatch({
                        changes: { from, to, insert: `[!${nextTypeUpper}]` },
                    });
                    return true;
                }
            }

            node = node.parent;
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

        const paragraphNode = findParagraphNodeAt(state, tree, cursorPos);
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

        // Default: Insert new alert at cursor
        const text = `> [!${DEFAULT_ALERT_TYPE}] `;
        view.dispatch(view.state.replaceSelection(text));
        return true;
    };
}
