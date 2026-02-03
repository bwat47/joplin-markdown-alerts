import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from './alertParsing';

const SYNTAX_TREE_TIMEOUT = 100;
const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const DEFAULT_ALERT_TYPE = 'NOTE';
const BLOCKQUOTE_LINE_PREFIX = /^>\s?/;

type ParagraphRange = {
    from: number;
    to: number;
};

type NodeRange = { from: number; to: number };

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

function getSyntaxTree(state: EditorState, position: number) {
    let tree = ensureSyntaxTree(state, position, SYNTAX_TREE_TIMEOUT);
    if (!tree) {
        tree = syntaxTree(state);
    }
    return tree;
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

function getProbePositions(state: EditorState, position: number): number[] {
    const line = state.doc.lineAt(position);
    const positions = [position, position - 1, position + 1];
    const match = BLOCKQUOTE_LINE_PREFIX.exec(line.text);
    if (match) {
        const afterPrefix = line.from + match[0].length;
        positions.push(afterPrefix);
        positions.push(afterPrefix + 1);
    }
    const max = Math.max(0, state.doc.length);
    return positions
        .map((pos) => Math.min(Math.max(pos, 0), max))
        .filter((pos, index, list) => list.indexOf(pos) === index);
}

function getParagraphLineRange(state: EditorState, node: NodeRange): ParagraphRange {
    const startLine = state.doc.lineAt(node.from);
    const endPos = Math.max(node.from, node.to - 1);
    const endLine = state.doc.lineAt(endPos);
    return { from: startLine.from, to: endLine.to };
}

function collectParagraphRanges(
    state: EditorState,
    tree: ReturnType<typeof syntaxTree>,
    from: number,
    to: number
): ParagraphRange[] {
    const ranges: ParagraphRange[] = [];
    const seen = new Set<string>();

    tree.iterate({
        from,
        to,
        enter: (node) => {
            if (node.name.toLowerCase() !== 'paragraph') {
                return;
            }
            const paragraphRange = getParagraphLineRange(state, node);
            const key = `${paragraphRange.from}:${paragraphRange.to}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            ranges.push(paragraphRange);
        },
    });

    return ranges.sort((a, b) => a.from - b.from);
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
                if (paragraphRanges.length === 0) {
                    const key = `${range.from}:${range.to}`;
                    if (!expandedRangeMap.has(key)) {
                        expandedRangeMap.set(key, { from: range.from, to: range.to });
                    }
                    continue;
                }

                const expandedRange = {
                    from: paragraphRanges[0].from,
                    to: paragraphRanges[paragraphRanges.length - 1].to,
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
        if (toggleAlertMarkerOnLine(view, cursorLine)) {
            return true;
        }
        const tree = getSyntaxTree(state, cursorPos);
        let outermostBlockquoteFrom: number | null = null;

        // Walk up ancestor nodes, preferring to toggle a blockquote whose first line
        // actually matches the GitHub alert marker syntax.
        for (const position of getProbePositions(state, cursorPos)) {
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
