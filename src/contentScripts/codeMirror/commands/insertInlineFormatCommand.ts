import type { SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { type InlineFormatDefinition } from '../../../inlineFormatCommands';
import { parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';
import { getProbePositions, getSyntaxTree } from '../shared/syntaxTreeUtils';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type WrappedSegment = {
    from: number;
    to: number;
};

type StructuralLineParts = {
    prefix: string;
    content: string;
};

const BLOCKQUOTE_PREFIX_REGEX = /^(\s*(?:>\s*)*)(.*)$/;
const HEADING_PREFIX_REGEX = /^(#{1,6}\s+)(.*)$/;
const LIST_PREFIX_REGEX = /^((?:[-+*]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?)(.*)$/;
const INDENTED_CONTENT_REGEX = /^(\s+)(.*)$/;
const LEADING_WHITESPACE_REGEX = /^([ \t]+)/;
const TRAILING_WHITESPACE_REGEX = /([ \t]+)$/;
const STRUCTURAL_PREFIX_PROBE_REGEX = /^[ \t]*(?:>\s*)*/;
const CODE_BLOCK_NODE_NAMES = new Set(['fencedcode', 'codeblock']);
const TABLE_NODE_NAMES = new Set(['table', 'tableheader', 'tablerow', 'tablecell', 'tabledelimiter']);
const HORIZONTAL_RULE_NODE_NAMES = new Set(['horizontalrule']);

function isIndexPartOfLongerDelimiter(text: string, index: number, longerDelimiters: string[] | undefined): boolean {
    if (!longerDelimiters || longerDelimiters.length === 0) {
        return false;
    }

    return longerDelimiters.some((delimiter) => {
        const start = Math.max(0, index - delimiter.length + 1);
        const end = Math.min(index, text.length - delimiter.length);

        for (let position = start; position <= end; position += 1) {
            if (text.slice(position, position + delimiter.length) === delimiter) {
                return true;
            }
        }

        return false;
    });
}

function isDelimiterAt(
    text: string,
    index: number,
    delimiter: string,
    longerDelimiters: string[] | undefined
): boolean {
    if (text.slice(index, index + delimiter.length) !== delimiter) {
        return false;
    }

    return !isIndexPartOfLongerDelimiter(text, index, longerDelimiters);
}

function findWrappedSegments(text: string, format: InlineFormatDefinition): WrappedSegment[] {
    const segments: WrappedSegment[] = [];
    let index = 0;

    while (index <= text.length - format.openingDelimiter.length) {
        if (!isDelimiterAt(text, index, format.openingDelimiter, format.conflictingLongerDelimiters)) {
            index += 1;
            continue;
        }

        const contentStart = index + format.openingDelimiter.length;
        let closingIndex = -1;

        for (let position = contentStart; position <= text.length - format.closingDelimiter.length; position += 1) {
            if (!isDelimiterAt(text, position, format.closingDelimiter, format.conflictingLongerDelimiters)) {
                continue;
            }

            if (position === contentStart) {
                continue;
            }

            closingIndex = position;
            break;
        }

        if (closingIndex === -1) {
            index += 1;
            continue;
        }

        segments.push({
            from: index,
            to: closingIndex + format.closingDelimiter.length,
        });
        index = closingIndex + format.closingDelimiter.length;
    }

    return segments;
}

function splitStructuralLineParts(line: string): StructuralLineParts | null {
    const blockquoteMatch = BLOCKQUOTE_PREFIX_REGEX.exec(line);
    if (!blockquoteMatch) {
        return null;
    }

    const [, blockquotePrefix, rest] = blockquoteMatch;

    if (blockquotePrefix && rest.length === 0) {
        return {
            prefix: line,
            content: '',
        };
    }

    const headingMatch = HEADING_PREFIX_REGEX.exec(rest);
    if (headingMatch) {
        return {
            prefix: `${blockquotePrefix}${headingMatch[1]}`,
            content: headingMatch[2],
        };
    }

    const listMatch = LIST_PREFIX_REGEX.exec(rest);
    if (listMatch) {
        return {
            prefix: `${blockquotePrefix}${listMatch[1]}`,
            content: listMatch[2],
        };
    }

    const indentedContentMatch = INDENTED_CONTENT_REGEX.exec(rest);
    if (indentedContentMatch && indentedContentMatch[2].length > 0) {
        return {
            prefix: `${blockquotePrefix}${indentedContentMatch[1]}`,
            content: indentedContentMatch[2],
        };
    }

    if (blockquotePrefix) {
        return {
            prefix: blockquotePrefix,
            content: rest,
        };
    }

    return null;
}

function wrapTextPreservingTrailingWhitespace(text: string, format: InlineFormatDefinition): string {
    const leadingWhitespaceMatch = LEADING_WHITESPACE_REGEX.exec(text);
    const trailingWhitespaceMatch = TRAILING_WHITESPACE_REGEX.exec(text);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '';
    const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[1] : '';
    const content = text.slice(leadingWhitespace.length, text.length - trailingWhitespace.length);

    if (content.length === 0) {
        return `${format.openingDelimiter}${text}${format.closingDelimiter}`;
    }

    return `${leadingWhitespace}${format.openingDelimiter}${content}${format.closingDelimiter}${trailingWhitespace}`;
}

export function applyInlineFormattingToSelectionText(text: string, format: InlineFormatDefinition): string {
    const wrappedSegments = findWrappedSegments(text, format);
    if (wrappedSegments.length === 1 && wrappedSegments[0].from === 0 && wrappedSegments[0].to === text.length) {
        return text.slice(format.openingDelimiter.length, text.length - format.closingDelimiter.length);
    }

    if (wrappedSegments.length === 0) {
        return wrapTextPreservingTrailingWhitespace(text, format);
    }

    let result = '';
    let lastIndex = 0;

    for (const segment of wrappedSegments) {
        result += text.slice(lastIndex, segment.from);
        result += text.slice(
            segment.from + format.openingDelimiter.length,
            segment.to - format.closingDelimiter.length
        );
        lastIndex = segment.to;
    }

    result += text.slice(lastIndex);
    return result;
}

function removeInlineFormattingFromText(text: string, format: InlineFormatDefinition): string {
    const wrappedSegments = findWrappedSegments(text, format);
    if (wrappedSegments.length === 0) {
        return text;
    }

    let result = '';
    let lastIndex = 0;

    for (const segment of wrappedSegments) {
        result += text.slice(lastIndex, segment.from);
        result += text.slice(
            segment.from + format.openingDelimiter.length,
            segment.to - format.closingDelimiter.length
        );
        lastIndex = segment.to;
    }

    result += text.slice(lastIndex);
    return result;
}

function formatFullLineText(line: string, format: InlineFormatDefinition, removalOnly = false): string {
    if (line.trim() === '') {
        return line;
    }

    const structuralParts = splitStructuralLineParts(line);
    if (structuralParts) {
        if (structuralParts.content.length === 0) {
            return line;
        }

        return `${structuralParts.prefix}${
            removalOnly
                ? removeInlineFormattingFromText(structuralParts.content, format)
                : applyInlineFormattingToSelectionText(structuralParts.content, format)
        }`;
    }

    return removalOnly
        ? removeInlineFormattingFromText(line, format)
        : applyInlineFormattingToSelectionText(line, format);
}

export function applyInlineFormattingToFullLineSelectionText(text: string, format: InlineFormatDefinition): string {
    return text
        .split('\n')
        .map((line) => formatFullLineText(line, format))
        .join('\n');
}

function isLineInsideSyntaxNodes(view: EditorView, lineFrom: number, nodeNames: ReadonlySet<string>): boolean {
    const state = view.state;
    const tree = getSyntaxTree(state, lineFrom);

    for (const probePosition of getProbePositions(state, lineFrom, STRUCTURAL_PREFIX_PROBE_REGEX)) {
        let node: SyntaxNode | null = tree.resolveInner(probePosition, 1);
        while (node) {
            if (nodeNames.has(node.name.toLowerCase())) {
                return true;
            }
            node = node.parent;
        }
    }

    return false;
}

function isLineInsideCodeBlock(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, CODE_BLOCK_NODE_NAMES);
}

function isLineInsideMarkdownTable(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, TABLE_NODE_NAMES);
}

function isLineHorizontalRule(view: EditorView, lineFrom: number): boolean {
    return isLineInsideSyntaxNodes(view, lineFrom, HORIZONTAL_RULE_NODE_NAMES);
}

function shouldSkipMarkdownTableLine(line: string, view: EditorView, lineFrom: number): boolean {
    if (!isLineInsideMarkdownTable(view, lineFrom)) {
        return false;
    }

    const structuralParts = splitStructuralLineParts(line);
    const content = structuralParts ? structuralParts.content : line;
    return content.includes('|');
}

function isGitHubAlertTitleLine(line: string): boolean {
    return parseGitHubAlertTitleLine(line) !== null;
}

function lineCanUseLineAwareFormatting(view: EditorView, line: string, lineFrom: number): boolean {
    return !(
        isLineInsideCodeBlock(view, lineFrom) ||
        shouldSkipMarkdownTableLine(line, view, lineFrom) ||
        isGitHubAlertTitleLine(line) ||
        isLineHorizontalRule(view, lineFrom)
    );
}

function lineHasTargetFormatting(line: string, format: InlineFormatDefinition): boolean {
    if (line.trim() === '') {
        return false;
    }

    const structuralParts = splitStructuralLineParts(line);
    const content = structuralParts ? structuralParts.content : line;

    return findWrappedSegments(content, format).length > 0;
}

function applyInlineFormattingToFullLineSelectionRange(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): string {
    const state = view.state;
    const startLine = state.doc.lineAt(range.from);
    const selectedText = state.doc.sliceString(range.from, range.to);
    const lines = selectedText.split('\n');
    const eligibleLineEntries = lines
        .map((line, index) => ({
            line,
            lineFrom: state.doc.line(startLine.number + index).from,
        }))
        .filter(({ line, lineFrom }) => lineCanUseLineAwareFormatting(view, line, lineFrom));
    const removalOnly = eligibleLineEntries.some(({ line }) => lineHasTargetFormatting(line, format));

    return lines
        .map((line, index) => {
            const lineFrom = state.doc.line(startLine.number + index).from;
            if (!lineCanUseLineAwareFormatting(view, line, lineFrom)) {
                return line;
            }

            return formatFullLineText(line, format, removalOnly);
        })
        .join('\n');
}

function isFullLineSelection(view: EditorView, range: SelectionRange): boolean {
    if (range.empty) {
        return false;
    }

    const state = view.state;
    const startLine = state.doc.lineAt(range.from);
    if (range.from !== startLine.from) {
        return false;
    }

    if (range.to === state.doc.length) {
        return true;
    }

    const lineAtEnd = state.doc.lineAt(range.to);
    return range.to === lineAtEnd.from || range.to === lineAtEnd.to;
}

function applyInlineFormattingToSelectionRange(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): string {
    const state = view.state;
    const selectedText = state.doc.sliceString(range.from, range.to);

    if (isFullLineSelection(view, range)) {
        return applyInlineFormattingToFullLineSelectionRange(view, range, format);
    }

    if (!selectedText.includes('\n')) {
        return applyInlineFormattingToSelectionText(selectedText, format);
    }

    const startLine = state.doc.lineAt(range.from);
    const lines = selectedText.split('\n');
    const lineEntries = lines.map((line, index) => {
        const docLine = state.doc.line(startLine.number + index);
        const selectionStart = index === 0 ? range.from - docLine.from : 0;
        const selectionEnd = index === lines.length - 1 ? range.to - docLine.from : docLine.length;
        const isFullLineSelection = selectionStart === 0 && selectionEnd === docLine.length;

        return {
            line,
            docLine,
            isFullLineSelection,
        };
    });
    const removalOnly = lineEntries
        .filter(({ line, docLine, isFullLineSelection }) => {
            return isFullLineSelection && lineCanUseLineAwareFormatting(view, line, docLine.from);
        })
        .some(({ line }) => lineHasTargetFormatting(line, format));

    return lineEntries
        .map(({ line, docLine, isFullLineSelection }) => {
            if (!isFullLineSelection) {
                return applyInlineFormattingToSelectionText(line, format);
            }

            if (!lineCanUseLineAwareFormatting(view, line, docLine.from)) {
                return line;
            }

            return formatFullLineText(line, format, removalOnly);
        })
        .join('\n');
}

function createExplicitSelection(anchorPos: number, headPos: number, basePos: number): ExplicitCursorSelection {
    return {
        anchorBasePos: basePos,
        anchorOffset: anchorPos - basePos,
        headBasePos: basePos,
        headOffset: headPos - basePos,
    };
}

function unwrapWrappedSegments(
    text: string,
    segments: WrappedSegment[],
    format: InlineFormatDefinition,
    expandedFrom: number
): string {
    let result = '';
    let lastIndex = 0;

    for (const segment of segments) {
        const relativeFrom = segment.from - expandedFrom;
        const relativeTo = segment.to - expandedFrom;
        const contentFrom = relativeFrom + format.openingDelimiter.length;
        const contentTo = relativeTo - format.closingDelimiter.length;

        result += text.slice(lastIndex, relativeFrom);
        result += text.slice(contentFrom, contentTo);
        lastIndex = relativeTo;
    }

    result += text.slice(lastIndex);
    return result;
}

function mapOffsetAfterUnwrapping(offset: number, segments: WrappedSegment[], format: InlineFormatDefinition): number {
    let removedLength = 0;

    for (const segment of segments) {
        const openingEnd = segment.from + format.openingDelimiter.length;
        const contentEnd = segment.to - format.closingDelimiter.length;

        if (offset < segment.from) {
            return offset - removedLength;
        }

        if (offset < openingEnd) {
            return segment.from - removedLength;
        }

        if (offset <= contentEnd) {
            return offset - removedLength - format.openingDelimiter.length;
        }

        if (offset < segment.to) {
            return contentEnd - removedLength - format.openingDelimiter.length;
        }

        removedLength += format.openingDelimiter.length + format.closingDelimiter.length;
    }

    return offset - removedLength;
}

function findSelectionFormattingAction(
    view: EditorView,
    range: SelectionRange,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } | null {
    if (range.empty) {
        return null;
    }

    const state = view.state;
    const selectedText = state.doc.sliceString(range.from, range.to);
    if (selectedText.includes('\n')) {
        return null;
    }

    const line = state.doc.lineAt(range.from);
    const selectionFrom = range.from - line.from;
    const selectionTo = range.to - line.from;
    const overlappingSegments = findWrappedSegments(line.text, format).filter((wrappedSegment) => {
        const selectionOverlapsSegment = selectionFrom < wrappedSegment.to && selectionTo > wrappedSegment.from;

        return selectionOverlapsSegment;
    });

    if (overlappingSegments.length === 0) {
        return null;
    }

    const firstSegment = overlappingSegments[0];
    const lastSegment = overlappingSegments[overlappingSegments.length - 1];
    const expandedFrom = firstSegment.from;
    const expandedTo = lastSegment.to;
    const docExpandedFrom = line.from + expandedFrom;
    const docExpandedTo = line.from + expandedTo;
    const updatedText = unwrapWrappedSegments(
        line.text.slice(expandedFrom, expandedTo),
        overlappingSegments,
        format,
        expandedFrom
    );
    const mappedAnchor = line.from + mapOffsetAfterUnwrapping(range.anchor - line.from, overlappingSegments, format);
    const mappedHead = line.from + mapOffsetAfterUnwrapping(range.head - line.from, overlappingSegments, format);

    return {
        key: `selection-removal:${docExpandedFrom}:${docExpandedTo}`,
        change: {
            from: docExpandedFrom,
            to: docExpandedTo,
            insert: updatedText,
        },
        explicitSelection: createExplicitSelection(mappedAnchor, mappedHead, docExpandedFrom),
    };
}

function findCursorFormattingAction(
    view: EditorView,
    cursorPos: number,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } | null {
    const state = view.state;
    const line = state.doc.lineAt(cursorPos);
    const cursorOffset = cursorPos - line.from;

    const segments = findWrappedSegments(line.text, format);
    const contentEnd = (s: WrappedSegment) => s.to - format.closingDelimiter.length;

    const segment = segments.find(
        (s) =>
            cursorOffset === s.from || cursorOffset === contentEnd(s) || (cursorOffset > s.from && cursorOffset <= s.to)
    );
    if (!segment) {
        return null;
    }

    const docSegmentFrom = line.from + segment.from;
    const docSegmentTo = line.from + segment.to;

    // Cursor right before the opening delimiter: jump in past the opening delimiter
    if (cursorOffset === segment.from) {
        return {
            key: `jump-in:${cursorPos}`,
            change: { from: cursorPos, to: cursorPos, insert: '' },
            explicitSelection: {
                anchorBasePos: cursorPos,
                anchorOffset: format.openingDelimiter.length,
                headBasePos: cursorPos,
                headOffset: format.openingDelimiter.length,
            },
        };
    }

    // Cursor right before the closing delimiter: jump out past the closing delimiter
    if (cursorOffset === contentEnd(segment)) {
        return {
            key: `jump:${cursorPos}`,
            change: { from: cursorPos, to: cursorPos, insert: '' },
            explicitSelection: {
                anchorBasePos: docSegmentTo,
                anchorOffset: 0,
                headBasePos: docSegmentTo,
                headOffset: 0,
            },
        };
    }

    // Cursor inside the segment or right after the closing delimiter: remove formatting
    const content = line.text.slice(
        segment.from + format.openingDelimiter.length,
        segment.to - format.closingDelimiter.length
    );

    return {
        key: `removal:${docSegmentFrom}:${docSegmentTo}`,
        change: {
            from: docSegmentFrom,
            to: docSegmentTo,
            insert: content,
        },
        explicitSelection: {
            anchorBasePos: docSegmentFrom,
            anchorOffset: 0,
            headBasePos: docSegmentFrom,
            headOffset: content.length,
        },
    };
}

function createCursorInsertion(
    cursorPos: number,
    format: InlineFormatDefinition
): { key: string; change: TextChange; explicitSelection: ExplicitCursorSelection } {
    const insertedText = `${format.openingDelimiter}${format.closingDelimiter}`;

    return {
        key: `cursor:${cursorPos}`,
        change: {
            from: cursorPos,
            to: cursorPos,
            insert: insertedText,
        },
        explicitSelection: {
            anchorBasePos: cursorPos,
            anchorOffset: format.openingDelimiter.length,
            headBasePos: cursorPos,
            headOffset: format.openingDelimiter.length,
        },
    };
}

function overlapsRange(change: TextChange, range: SelectionRange): boolean {
    if (change.from === change.to) {
        return change.from >= range.from && change.from <= range.to;
    }

    return change.from < range.to && change.to > range.from;
}

/**
 * Creates an inline-format command that supports multiple selections, cursor insertion, and
 * list-aware multiline full-line formatting.
 */
export function createInsertInlineFormatCommand(view: EditorView, format: InlineFormatDefinition): () => boolean {
    return () => {
        const state = view.state;
        const changeMap = new Map<string, TextChange>();
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();
        const nonEmptyRanges = state.selection.ranges.filter((range) => !range.empty);

        state.selection.ranges.forEach((range, index) => {
            if (range.empty) {
                const removal = findCursorFormattingAction(view, range.head, format);
                if (removal) {
                    if (!changeMap.has(removal.key)) {
                        changeMap.set(removal.key, removal.change);
                    }
                    explicitSelectionsByIndex.set(index, removal.explicitSelection);
                    return;
                }

                const cursorInsertion = createCursorInsertion(range.head, format);
                if (nonEmptyRanges.some((nonEmptyRange) => overlapsRange(cursorInsertion.change, nonEmptyRange))) {
                    return;
                }

                if (!changeMap.has(cursorInsertion.key)) {
                    changeMap.set(cursorInsertion.key, cursorInsertion.change);
                }
                explicitSelectionsByIndex.set(index, cursorInsertion.explicitSelection);
                return;
            }

            const selectionRemoval = findSelectionFormattingAction(view, range, format);
            if (selectionRemoval) {
                if (!changeMap.has(selectionRemoval.key)) {
                    changeMap.set(selectionRemoval.key, selectionRemoval.change);
                }
                explicitSelectionsByIndex.set(index, selectionRemoval.explicitSelection);
                return;
            }

            const selectedText = state.doc.sliceString(range.from, range.to);
            const updatedText = applyInlineFormattingToSelectionRange(view, range, format);

            if (updatedText === selectedText) {
                return;
            }

            changeMap.set(`selection:${range.from}:${range.to}`, {
                from: range.from,
                to: range.to,
                insert: updatedText,
            });
        });

        const changes = Array.from(changeMap.values());
        if (changes.length === 0) {
            return false;
        }

        dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
