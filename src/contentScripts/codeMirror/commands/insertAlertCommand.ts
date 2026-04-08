import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import {
    collectParagraphRanges,
    findParagraphNodeAt,
    getParagraphLineRange,
    getProbePositions,
    getSyntaxTree,
    type ParagraphRange,
} from '../shared/syntaxTreeUtils';

const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*(?:>\s*)+)/;
const DEFAULT_ALERT_TYPE = 'NOTE';
const BLOCKQUOTE_LINE_PREFIX = /^>\s?/;

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

function overlapsRange(change: TextChange, range: ParagraphRange): boolean {
    if (change.from === change.to) {
        return change.from >= range.from && change.from <= range.to;
    }

    return change.from < range.to && change.to > range.from;
}

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

function getToggledAlertLineText(line: string): string | null {
    const alertInfo = parseGitHubAlertTitleLine(line);
    if (!alertInfo) {
        return null;
    }

    const currentIndex = GITHUB_ALERT_TYPES.indexOf(alertInfo.type);
    const nextIndex = (currentIndex + 1) % GITHUB_ALERT_TYPES.length;
    const nextTypeUpper = GITHUB_ALERT_TYPES[nextIndex].toUpperCase();

    return line.slice(0, alertInfo.markerRange.from) + `[!${nextTypeUpper}]` + line.slice(alertInfo.markerRange.to);
}

function createAlertCursorChange(
    state: EditorState,
    cursorPos: number
): { key: string; change: TextChange; explicitSelection?: ExplicitCursorSelection } {
    const cursorLine = state.doc.lineAt(cursorPos);
    if (cursorLine.text.trim() === '') {
        const insertionText = `> [!${DEFAULT_ALERT_TYPE}] `;

        return {
            key: `line:${cursorLine.from}:${cursorLine.to}`,
            change: {
                from: cursorLine.from,
                to: cursorLine.to,
                insert: insertionText,
            },
            explicitSelection: {
                anchorBasePos: cursorLine.from,
                anchorOffset: insertionText.length,
                headBasePos: cursorLine.from,
                headOffset: insertionText.length,
            },
        };
    }

    const updatedCursorLine = getToggledAlertLineText(cursorLine.text);
    if (updatedCursorLine) {
        return {
            key: `line:${cursorLine.from}:${cursorLine.to}`,
            change: {
                from: cursorLine.from,
                to: cursorLine.to,
                insert: updatedCursorLine,
            },
        };
    }

    const tree = getSyntaxTree(state, cursorPos);
    let outermostBlockquoteFrom: number | null = null;

    for (const position of getProbePositions(state, cursorPos, BLOCKQUOTE_LINE_PREFIX)) {
        let node: SyntaxNode | null = tree.resolveInner(position, -1);
        while (node) {
            if (node.name.toLowerCase() === 'blockquote') {
                outermostBlockquoteFrom = node.from;

                const blockquoteStartLine = state.doc.lineAt(node.from);
                const updatedBlockquoteLine = getToggledAlertLineText(blockquoteStartLine.text);
                if (updatedBlockquoteLine) {
                    return {
                        key: `line:${blockquoteStartLine.from}:${blockquoteStartLine.to}`,
                        change: {
                            from: blockquoteStartLine.from,
                            to: blockquoteStartLine.to,
                            insert: updatedBlockquoteLine,
                        },
                    };
                }
            }

            node = node.parent;
        }
    }

    if (outermostBlockquoteFrom !== null) {
        const blockquoteStartLine = state.doc.lineAt(outermostBlockquoteFrom);
        const match = BLOCKQUOTE_PREFIX_PATTERN.exec(blockquoteStartLine.text);
        if (match) {
            return {
                key: `insert:${blockquoteStartLine.from}`,
                change: {
                    from: blockquoteStartLine.from,
                    to: blockquoteStartLine.from,
                    insert: `${createAlertLine(match[1])}\n`,
                },
            };
        }
    }

    const paragraphNode = findParagraphNodeAt(state, tree, cursorPos, BLOCKQUOTE_LINE_PREFIX);
    if (paragraphNode) {
        const paragraphRange = getParagraphLineRange(state, paragraphNode);
        const text = state.doc.sliceString(paragraphRange.from, paragraphRange.to);
        const updated = toggleAlertSelectionText(text);

        return {
            key: `paragraph:${paragraphRange.from}:${paragraphRange.to}`,
            change: {
                from: paragraphRange.from,
                to: paragraphRange.to,
                insert: updated,
            },
        };
    }

    const updatedFallbackLine = toggleAlertSelectionText(cursorLine.text);
    return {
        key: `line:${cursorLine.from}:${cursorLine.to}`,
        change: {
            from: cursorLine.from,
            to: cursorLine.to,
            insert: updatedFallbackLine,
        },
    };
}

/**
 * Inserts or cycles a GitHub alert block.
 * - If text is not fully quoted, inserts an alert title line and quotes all lines.
 * - If already an alert, cycles the marker on the first line while preserving the title and nesting prefix.
 * - If quoted but not an alert, injects an alert marker respecting existing blockquote depth.
 */
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
 * Creates a command that inserts or cycles a GitHub alert.
 * - Selections: expand each selection to paragraph boundaries, dedupe ranges, and apply `toggleAlertSelectionText` to each.
 * - Cursor on empty line: insert `> [!NOTE] ` and place the cursor after the marker.
 * - Cursor on an alert title line: cycle the alert marker on that line.
 * - Cursor inside a regular blockquote: insert an alert title line above the blockquote, respecting its nesting prefix.
 * - Otherwise: toggle alert formatting for the surrounding paragraph or current line via `toggleAlertSelectionText`.
 */
export function createInsertAlertCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const ranges = state.selection.ranges;
        const nonEmptyRanges = ranges.filter((range) => !range.empty);
        const emptyRanges = ranges.filter((range) => range.empty);

        if (nonEmptyRanges.length > 0) {
            const expandedRanges: ParagraphRange[] = [];
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
                expandedRanges.push(expandedRange);
            }

            const mergedRanges = expandedRanges
                .sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from))
                .reduce<ParagraphRange[]>((merged, range) => {
                    const last = merged[merged.length - 1];
                    if (!last) {
                        merged.push({ ...range });
                        return merged;
                    }
                    if (range.from <= last.to) {
                        last.to = Math.max(last.to, range.to);
                        return merged;
                    }
                    merged.push({ ...range });
                    return merged;
                }, []);

            const changes = mergedRanges.map((range) => {
                const text = state.doc.sliceString(range.from, range.to);
                const updated = toggleAlertSelectionText(text);

                return {
                    from: range.from,
                    to: range.to,
                    insert: updated,
                };
            });

            if (emptyRanges.length === 0) {
                view.dispatch({ changes });
                view.focus();
                return true;
            }

            const changeMap = new Map<string, TextChange>();
            changes.forEach((change) => {
                changeMap.set(`selection:${change.from}:${change.to}`, change);
            });

            const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
            ranges.forEach((range, index) => {
                if (!range.empty) {
                    return;
                }

                const cursorChange = createAlertCursorChange(state, range.head);
                if (mergedRanges.some((mergedRange) => overlapsRange(cursorChange.change, mergedRange))) {
                    return;
                }

                if (!changeMap.has(cursorChange.key)) {
                    changeMap.set(cursorChange.key, cursorChange.change);
                }
                if (cursorChange.explicitSelection) {
                    explicitSelectionsByIndex.set(index, cursorChange.explicitSelection);
                }
            });

            dispatchChangesWithSelections(view, Array.from(changeMap.values()), explicitSelectionsByIndex);
            view.focus();
            return true;
        }

        const changeMap = new Map<string, TextChange>();
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();

        ranges.forEach((range, index) => {
            const cursorChange = createAlertCursorChange(state, range.head);
            if (!changeMap.has(cursorChange.key)) {
                changeMap.set(cursorChange.key, cursorChange.change);
            }
            if (cursorChange.explicitSelection) {
                explicitSelectionsByIndex.set(index, cursorChange.explicitSelection);
            }
        });

        dispatchChangesWithSelections(view, Array.from(changeMap.values()), explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
