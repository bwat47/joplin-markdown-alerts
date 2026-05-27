import type { EditorView } from '@codemirror/view';
import type { EditorState, SelectionRange } from '@codemirror/state';
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
const DEFAULT_ALERT_INSERT_TEXT = `> [!${DEFAULT_ALERT_TYPE}] `;
const DEFAULT_ALERT_TYPE_SELECTION_FROM = DEFAULT_ALERT_INSERT_TEXT.indexOf(DEFAULT_ALERT_TYPE);
const DEFAULT_ALERT_TYPE_SELECTION_TO = DEFAULT_ALERT_TYPE_SELECTION_FROM + DEFAULT_ALERT_TYPE.length;
const BLOCKQUOTE_LINE_PREFIX = /^>\s?/;
const BLOCKQUOTE_PREFIX_TEXT = '> ';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type AlertTarget = {
    range: ParagraphRange;
    text: string;
    updatedText: string;
};

type TextPosition = {
    lineIndex: number;
    lineOffset: number;
};

type MappedAlertPosition = {
    basePos: number;
    offset: number;
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

function createDefaultAlertTypeSelectionAt(basePos: number, text: string): ExplicitCursorSelection | null {
    const firstLine = text.split('\n')[0];
    const alertInfo = parseGitHubAlertTitleLine(firstLine);
    // Only select newly inserted default markers; cycled alerts keep normal cursor mapping.
    if (!alertInfo || alertInfo.type.toUpperCase() !== DEFAULT_ALERT_TYPE) {
        return null;
    }

    return {
        anchorBasePos: basePos,
        anchorOffset: alertInfo.markerRange.from + 2,
        headBasePos: basePos,
        headOffset: alertInfo.markerRange.to - 1,
    };
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

function getTextPosition(text: string, offset: number): TextPosition {
    const lines = text.split('\n');
    let remainingOffset = offset;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const lineLength = lines[lineIndex].length;
        if (remainingOffset <= lineLength || lineIndex === lines.length - 1) {
            return {
                lineIndex,
                lineOffset: Math.min(remainingOffset, lineLength),
            };
        }

        remainingOffset -= lineLength + 1;
    }

    return {
        lineIndex: lines.length - 1,
        lineOffset: lines[lines.length - 1].length,
    };
}

function getQuotedContentOffset(lines: string[], position: TextPosition): number {
    let offset = createAlertLine('> ').length + 1;

    for (let index = 0; index < position.lineIndex; index += 1) {
        offset += BLOCKQUOTE_PREFIX_TEXT.length + lines[index].length + 1;
    }

    return offset + BLOCKQUOTE_PREFIX_TEXT.length + position.lineOffset;
}

function mapPositionThroughAlertTransform(target: AlertTarget, position: number): MappedAlertPosition | null {
    if (position < target.range.from || position > target.range.to) {
        return null;
    }

    const relativePosition = position - target.range.from;
    const lines = target.text.split('\n');
    const allQuoted = lines.every((line) => isBlockquoteLine(line));

    if (!allQuoted) {
        return {
            basePos: target.range.from,
            offset: getQuotedContentOffset(lines, getTextPosition(target.text, relativePosition)),
        };
    }

    const firstLine = lines[0];
    const alertInfo = parseGitHubAlertTitleLine(firstLine);
    if (alertInfo) {
        const updatedFirstLine = target.updatedText.split('\n')[0];
        const updatedAlertInfo = parseGitHubAlertTitleLine(updatedFirstLine);
        if (!updatedAlertInfo) {
            return null;
        }

        const markerDelta =
            updatedAlertInfo.markerRange.to -
            updatedAlertInfo.markerRange.from -
            (alertInfo.markerRange.to - alertInfo.markerRange.from);

        if (relativePosition <= alertInfo.markerRange.from) {
            return { basePos: target.range.from, offset: relativePosition };
        }

        if (relativePosition >= alertInfo.markerRange.to) {
            return { basePos: target.range.from, offset: relativePosition + markerDelta };
        }

        return {
            basePos: target.range.from,
            offset:
                updatedAlertInfo.markerRange.from +
                Math.min(
                    relativePosition - alertInfo.markerRange.from,
                    updatedAlertInfo.markerRange.to - updatedAlertInfo.markerRange.from
                ),
        };
    }

    const prefix = getBlockquotePrefix(firstLine) ?? BLOCKQUOTE_PREFIX_TEXT;
    return {
        basePos: target.range.from,
        offset: createAlertLine(prefix).length + 1 + relativePosition,
    };
}

function findTargetContainingPosition(targets: AlertTarget[], position: number): AlertTarget | null {
    return targets.find((target) => position >= target.range.from && position <= target.range.to) ?? null;
}

function createAlertTypeSelection(target: AlertTarget, range: SelectionRange): ExplicitCursorSelection | null {
    const firstLine = target.text.split('\n')[0];
    const alertInfo = parseGitHubAlertTitleLine(firstLine);
    if (!alertInfo) {
        return null;
    }

    const typeFrom = target.range.from + alertInfo.markerRange.from + 2;
    const typeTo = target.range.from + alertInfo.markerRange.to - 1;
    const selectionFrom = Math.min(range.anchor, range.head);
    const selectionTo = Math.max(range.anchor, range.head);
    if (selectionFrom !== typeFrom || selectionTo !== typeTo) {
        return null;
    }

    const updatedFirstLine = target.updatedText.split('\n')[0];
    const updatedAlertInfo = parseGitHubAlertTitleLine(updatedFirstLine);
    if (!updatedAlertInfo) {
        return null;
    }

    const nextTypeFrom = updatedAlertInfo.markerRange.from + 2;
    const nextTypeTo = updatedAlertInfo.markerRange.to - 1;
    const isForwardSelection = range.anchor <= range.head;

    return {
        anchorBasePos: target.range.from,
        anchorOffset: isForwardSelection ? nextTypeFrom : nextTypeTo,
        headBasePos: target.range.from,
        headOffset: isForwardSelection ? nextTypeTo : nextTypeFrom,
    };
}

function createExplicitAlertSelection(targets: AlertTarget[], range: SelectionRange): ExplicitCursorSelection | null {
    const anchorTarget = findTargetContainingPosition(targets, range.anchor);
    const headTarget = findTargetContainingPosition(targets, range.head);
    if (!anchorTarget || !headTarget || anchorTarget !== headTarget) {
        return null;
    }

    const alertTypeSelection = createAlertTypeSelection(anchorTarget, range);
    if (alertTypeSelection) {
        return alertTypeSelection;
    }

    const mappedAnchor = mapPositionThroughAlertTransform(anchorTarget, range.anchor);
    const mappedHead = mapPositionThroughAlertTransform(headTarget, range.head);
    if (!mappedAnchor || !mappedHead) {
        return null;
    }

    return {
        anchorBasePos: mappedAnchor.basePos,
        anchorOffset: mappedAnchor.offset,
        headBasePos: mappedHead.basePos,
        headOffset: mappedHead.offset,
    };
}

function createAlertCursorChange(
    state: EditorState,
    cursorPos: number
): { key: string; change: TextChange; explicitSelection?: ExplicitCursorSelection } {
    const cursorLine = state.doc.lineAt(cursorPos);
    if (cursorLine.text.trim() === '') {
        return {
            key: `line:${cursorLine.from}:${cursorLine.to}`,
            change: {
                from: cursorLine.from,
                to: cursorLine.to,
                insert: DEFAULT_ALERT_INSERT_TEXT,
            },
            explicitSelection: {
                anchorBasePos: cursorLine.from,
                anchorOffset: DEFAULT_ALERT_TYPE_SELECTION_FROM,
                headBasePos: cursorLine.from,
                headOffset: DEFAULT_ALERT_TYPE_SELECTION_TO,
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
            const insert = `${createAlertLine(match[1])}\n`;
            return {
                key: `insert:${blockquoteStartLine.from}`,
                change: {
                    from: blockquoteStartLine.from,
                    to: blockquoteStartLine.from,
                    insert,
                },
                explicitSelection: createDefaultAlertTypeSelectionAt(blockquoteStartLine.from, insert) ?? undefined,
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
            explicitSelection: createDefaultAlertTypeSelectionAt(paragraphRange.from, updated) ?? undefined,
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
        explicitSelection: createDefaultAlertTypeSelectionAt(cursorLine.from, updatedFallbackLine) ?? undefined,
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
 * - Cursor on empty line: insert `> [!NOTE] ` and select `NOTE`.
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

            const targets = mergedRanges.map((range) => {
                const text = state.doc.sliceString(range.from, range.to);
                const updated = toggleAlertSelectionText(text);

                return {
                    range,
                    text,
                    updatedText: updated,
                };
            });
            const changes = targets.map((target) => ({
                from: target.range.from,
                to: target.range.to,
                insert: target.updatedText,
            }));

            const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
            ranges.forEach((range, index) => {
                if (range.empty) {
                    return;
                }

                const explicitSelection = createExplicitAlertSelection(targets, range);
                if (explicitSelection) {
                    explicitSelectionsByIndex.set(index, explicitSelection);
                }
            });

            if (emptyRanges.length === 0) {
                dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
                view.focus();
                return true;
            }

            const changeMap = new Map<string, TextChange>();
            changes.forEach((change) => {
                changeMap.set(`selection:${change.from}:${change.to}`, change);
            });

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
