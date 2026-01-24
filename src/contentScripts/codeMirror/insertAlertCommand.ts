import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from './alertParsing';

const SYNTAX_TREE_TIMEOUT = 100;

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
        const cursorPos = state.selection.main.head;

        // Ensure the syntax tree is available before resolving nodes.
        // If this times out, fall back to whatever tree is currently available.
        ensureSyntaxTree(state, cursorPos, SYNTAX_TREE_TIMEOUT);

        const tree = syntaxTree(state);
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
            // Convert standard blockquote to alert by inserting the marker after the prefix.
            const blockquoteStartLine = state.doc.lineAt(outermostBlockquoteFrom);
            const match = /^(\s*(?:>\s*)+)/.exec(blockquoteStartLine.text);
            if (match) {
                const insertionPoint = blockquoteStartLine.from + match[1].length;
                view.dispatch({
                    changes: { from: insertionPoint, insert: '[!NOTE] ' },
                });
                return true;
            }
        }

        // Default: Insert new alert at cursor
        const text = '> [!NOTE] ';
        view.dispatch(view.state.replaceSelection(text));
        return true;
    };
}
