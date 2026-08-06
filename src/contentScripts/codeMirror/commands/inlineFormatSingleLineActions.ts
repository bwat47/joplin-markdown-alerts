import { type InlineFormatDefinition } from '../../../inlineFormatCommands';

type WrappedSegment = {
    from: number;
    to: number;
};

export type StructuralLineParts = {
    prefix: string;
    content: string;
};

export type RelativeSelection = {
    from: number;
    to: number;
    anchor: number;
    head: number;
};

export type SingleLineRelativeAction = {
    kind: 'selection-removal' | 'cursor-jump-in' | 'cursor-jump-out' | 'cursor-removal';
    replaceFrom: number;
    replaceTo: number;
    insert: string;
    nextAnchor: number;
    nextHead: number;
    selectionBase: number;
};

// These only match the structural prefix; the content is the remainder of the line. Pairing an ambiguous
// prefix with a `(.*)$` tail backtracks super-linearly, so the split is done by slicing instead.
const BLOCKQUOTE_PREFIX_REGEX = /^\s*(?:>\s*)*/;
const HEADING_PREFIX_REGEX = /^#{1,6}\s+/;
const LIST_PREFIX_REGEX = /^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const INDENTED_CONTENT_REGEX = /^\s+/;
const HORIZONTAL_WHITESPACE_CHARACTERS = new Set([' ', '\t']);

function matchPrefixLength(text: string, prefixRegex: RegExp): number {
    return prefixRegex.exec(text)?.[0].length ?? 0;
}

function leadingHorizontalWhitespaceLength(text: string): number {
    let length = 0;

    while (length < text.length && HORIZONTAL_WHITESPACE_CHARACTERS.has(text[length])) {
        length += 1;
    }

    return length;
}

// Scanned rather than matched with `/[ \t]+$/`, which backtracks quadratically on whitespace-heavy lines.
function trailingHorizontalWhitespaceLength(text: string): number {
    let length = 0;

    while (length < text.length && HORIZONTAL_WHITESPACE_CHARACTERS.has(text[text.length - 1 - length])) {
        length += 1;
    }

    return length;
}

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

export function splitStructuralLineParts(line: string): StructuralLineParts | null {
    const blockquotePrefix = line.slice(0, matchPrefixLength(line, BLOCKQUOTE_PREFIX_REGEX));
    const rest = line.slice(blockquotePrefix.length);

    if (blockquotePrefix && rest.length === 0) {
        return {
            prefix: line,
            content: '',
        };
    }

    const headingPrefixLength = matchPrefixLength(rest, HEADING_PREFIX_REGEX);
    if (headingPrefixLength > 0) {
        return {
            prefix: `${blockquotePrefix}${rest.slice(0, headingPrefixLength)}`,
            content: rest.slice(headingPrefixLength),
        };
    }

    const listPrefixLength = matchPrefixLength(rest, LIST_PREFIX_REGEX);
    if (listPrefixLength > 0) {
        return {
            prefix: `${blockquotePrefix}${rest.slice(0, listPrefixLength)}`,
            content: rest.slice(listPrefixLength),
        };
    }

    const indentLength = matchPrefixLength(rest, INDENTED_CONTENT_REGEX);
    if (indentLength > 0 && indentLength < rest.length) {
        return {
            prefix: `${blockquotePrefix}${rest.slice(0, indentLength)}`,
            content: rest.slice(indentLength),
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
    const leadingWhitespace = text.slice(0, leadingHorizontalWhitespaceLength(text));
    const trailingWhitespace = text.slice(text.length - trailingHorizontalWhitespaceLength(text));
    const content = text.slice(leadingWhitespace.length, text.length - trailingWhitespace.length);

    if (content.length === 0) {
        return `${format.openingDelimiter}${text}${format.closingDelimiter}`;
    }

    return `${leadingWhitespace}${format.openingDelimiter}${content}${format.closingDelimiter}${trailingWhitespace}`;
}

function stripWrappedSegmentsFromText(
    text: string,
    wrappedSegments: WrappedSegment[],
    format: InlineFormatDefinition
): string {
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
    return stripWrappedSegmentsFromText(text, findWrappedSegments(text, format), format);
}

export function applyInlineFormattingToSelectionText(text: string, format: InlineFormatDefinition): string {
    const wrappedSegments = findWrappedSegments(text, format);
    if (wrappedSegments.length === 0) {
        return wrapTextPreservingTrailingWhitespace(text, format);
    }

    return stripWrappedSegmentsFromText(text, wrappedSegments, format);
}

export function formatFullLineText(line: string, format: InlineFormatDefinition, removalOnly = false): string {
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

export function lineHasTargetFormatting(line: string, format: InlineFormatDefinition): boolean {
    if (line.trim() === '') {
        return false;
    }

    const structuralParts = splitStructuralLineParts(line);
    const content = structuralParts ? structuralParts.content : line;

    return findWrappedSegments(content, format).length > 0;
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
    // This mirrors delimiter-only deletions inside a single expanded replacement.
    // The shared ChangeSet mapping only sees that replacement's outer range, so it
    // cannot preserve offsets inside the unwrapped content without this local mapping.
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

export function analyzeSingleLineSelectionRemoval(
    lineText: string,
    selection: RelativeSelection,
    format: InlineFormatDefinition
): SingleLineRelativeAction | null {
    const overlappingSegments = findWrappedSegments(lineText, format).filter((wrappedSegment) => {
        const selectionOverlapsSegment = selection.from < wrappedSegment.to && selection.to > wrappedSegment.from;

        return selectionOverlapsSegment;
    });

    if (overlappingSegments.length === 0) {
        return null;
    }

    const firstSegment = overlappingSegments[0];
    const lastSegment = overlappingSegments[overlappingSegments.length - 1];
    const replaceFrom = firstSegment.from;
    const replaceTo = lastSegment.to;

    return {
        kind: 'selection-removal',
        replaceFrom,
        replaceTo,
        insert: unwrapWrappedSegments(lineText.slice(replaceFrom, replaceTo), overlappingSegments, format, replaceFrom),
        nextAnchor: mapOffsetAfterUnwrapping(selection.anchor, overlappingSegments, format),
        nextHead: mapOffsetAfterUnwrapping(selection.head, overlappingSegments, format),
        selectionBase: replaceFrom,
    };
}

function contentEnd(segment: WrappedSegment, format: InlineFormatDefinition): number {
    return segment.to - format.closingDelimiter.length;
}

export function analyzeSingleLineCursorAction(
    lineText: string,
    cursorOffset: number,
    format: InlineFormatDefinition
): SingleLineRelativeAction | null {
    const segment = findWrappedSegments(lineText, format).find(
        (wrappedSegment) =>
            cursorOffset === wrappedSegment.from ||
            cursorOffset === contentEnd(wrappedSegment, format) ||
            (cursorOffset > wrappedSegment.from && cursorOffset <= wrappedSegment.to)
    );
    if (!segment) {
        return null;
    }

    if (cursorOffset === segment.from) {
        return {
            kind: 'cursor-jump-in',
            replaceFrom: cursorOffset,
            replaceTo: cursorOffset,
            insert: '',
            nextAnchor: cursorOffset + format.openingDelimiter.length,
            nextHead: cursorOffset + format.openingDelimiter.length,
            selectionBase: cursorOffset,
        };
    }

    if (cursorOffset === contentEnd(segment, format)) {
        return {
            kind: 'cursor-jump-out',
            replaceFrom: cursorOffset,
            replaceTo: cursorOffset,
            insert: '',
            nextAnchor: segment.to,
            nextHead: segment.to,
            selectionBase: segment.to,
        };
    }

    const content = lineText.slice(
        segment.from + format.openingDelimiter.length,
        segment.to - format.closingDelimiter.length
    );

    return {
        kind: 'cursor-removal',
        replaceFrom: segment.from,
        replaceTo: segment.to,
        insert: content,
        nextAnchor: segment.from,
        nextHead: segment.from + content.length,
        selectionBase: segment.from,
    };
}
