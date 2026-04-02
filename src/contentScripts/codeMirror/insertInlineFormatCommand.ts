import type { SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { type InlineFormatDefinition } from '../../inlineFormatCommands';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from './commandSelectionUtils';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type WrappedSegment = {
    from: number;
    to: number;
};

// Matches list content while preserving structural markers such as:
// `- item`, `1. item`, `> - [ ] item`, `> 2) [x] item`
const LIST_LINE_PREFIX_REGEX = /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?)(.*)$/;

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

export function applyInlineFormattingToSelectionText(text: string, format: InlineFormatDefinition): string {
    const wrappedSegments = findWrappedSegments(text, format);
    if (wrappedSegments.length === 1 && wrappedSegments[0].from === 0 && wrappedSegments[0].to === text.length) {
        return text.slice(format.openingDelimiter.length, text.length - format.closingDelimiter.length);
    }

    if (wrappedSegments.length === 0) {
        return `${format.openingDelimiter}${text}${format.closingDelimiter}`;
    }

    let result = '';
    let lastIndex = 0;

    for (const segment of wrappedSegments) {
        result += text.slice(lastIndex, segment.from);
        result += text.slice(segment.from + format.openingDelimiter.length, segment.to - format.closingDelimiter.length);
        lastIndex = segment.to;
    }

    result += text.slice(lastIndex);
    return result;
}

function formatFullLineText(line: string, format: InlineFormatDefinition): string {
    if (line.trim() === '') {
        return line;
    }

    const listMatch = LIST_LINE_PREFIX_REGEX.exec(line);
    if (!listMatch) {
        return applyInlineFormattingToSelectionText(line, format);
    }

    const [, prefix, content] = listMatch;
    if (content.length === 0) {
        return line;
    }

    return `${prefix}${applyInlineFormattingToSelectionText(content, format)}`;
}

export function applyInlineFormattingToFullLineSelectionText(text: string, format: InlineFormatDefinition): string {
    return text
        .split('\n')
        .map((line) => formatFullLineText(line, format))
        .join('\n');
}

function isMultilineFullLineSelection(view: EditorView, range: SelectionRange): boolean {
    if (range.empty) {
        return false;
    }

    const state = view.state;
    const selectedText = state.doc.sliceString(range.from, range.to);
    if (!selectedText.includes('\n')) {
        return false;
    }

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

            const selectedText = state.doc.sliceString(range.from, range.to);
            const updatedText = isMultilineFullLineSelection(view, range)
                ? applyInlineFormattingToFullLineSelectionText(selectedText, format)
                : applyInlineFormattingToSelectionText(selectedText, format);

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
