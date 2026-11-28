import type { InlineFormatDefinition } from '../../../inlineFormatCommands';
import { rangesOverlap, type TextRange } from '../shared/commandRangeUtils';

type StructuralLineParts = {
    prefix: string;
    content: string;
};

/**
 * What the format command does for a cursor that touches a wrapped segment:
 * - `move`: place the cursor at `position` (just inside the opening, or just past the closing delimiter).
 * - `unwrap`: remove the segment's delimiters and select its content.
 */
export type CursorAction = { kind: 'move'; position: number } | { kind: 'unwrap'; segment: TextRange };

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

    while (length < text.length && HORIZONTAL_WHITESPACE_CHARACTERS.has(text.charAt(length))) {
        length += 1;
    }

    return length;
}

// Scanned rather than matched with `/[ \t]+$/`, which backtracks quadratically on whitespace-heavy lines.
function trailingHorizontalWhitespaceLength(text: string): number {
    let length = 0;

    while (length < text.length && HORIZONTAL_WHITESPACE_CHARACTERS.has(text.charAt(text.length - 1 - length))) {
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
    format: InlineFormatDefinition,
    excludedRanges: readonly TextRange[]
): boolean {
    if (text.slice(index, index + delimiter.length) !== delimiter) {
        return false;
    }

    const delimiterRange = { from: index, to: index + delimiter.length };
    if (excludedRanges.some((excludedRange) => rangesOverlap(delimiterRange, excludedRange))) {
        return false;
    }

    return !isIndexPartOfLongerDelimiter(text, index, format.conflictingLongerDelimiters);
}

/**
 * Finds non-overlapping `opening…closing` spans of the target format, left to right. Delimiters that
 * overlap `excludedRanges` (e.g. inline code, blockquote markers) are ignored.
 *
 * @example findWrappedSegments('`~~` and ~~word~~', strikethrough, [{ from: 0, to: 4 }]) // [{ from: 9, to: 17 }]
 */
export function findWrappedSegments(
    text: string,
    format: InlineFormatDefinition,
    excludedRanges: readonly TextRange[] = []
): TextRange[] {
    const segments: TextRange[] = [];
    let index = 0;

    while (index <= text.length - format.openingDelimiter.length) {
        if (!isDelimiterAt(text, index, format.openingDelimiter, format, excludedRanges)) {
            index += 1;
            continue;
        }

        const contentStart = index + format.openingDelimiter.length;
        let closingIndex = -1;

        for (let position = contentStart + 1; position <= text.length - format.closingDelimiter.length; position += 1) {
            if (isDelimiterAt(text, position, format.closingDelimiter, format, excludedRanges)) {
                closingIndex = position;
                break;
            }
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

/**
 * Wraps selected text as-is, keeping leading and trailing horizontal whitespace outside the delimiters.
 * Whitespace-only text is wrapped whole.
 */
export function wrapSelectionText(text: string, format: InlineFormatDefinition): string {
    const leadingWhitespace = text.slice(0, leadingHorizontalWhitespaceLength(text));
    const trailingWhitespace = text.slice(text.length - trailingHorizontalWhitespaceLength(text));
    const content = text.slice(leadingWhitespace.length, text.length - trailingWhitespace.length);

    if (content.length === 0) {
        return `${format.openingDelimiter}${text}${format.closingDelimiter}`;
    }

    return `${leadingWhitespace}${format.openingDelimiter}${content}${format.closingDelimiter}${trailingWhitespace}`;
}

/**
 * Wraps text that starts at a line boundary, keeping structural prefixes (blockquote markers, headings,
 * list markers, indentation) outside the delimiters. Whitespace-only lines are left unchanged.
 */
export function wrapFullLineText(line: string, format: InlineFormatDefinition): string {
    if (line.trim() === '') {
        return line;
    }

    const structuralParts = splitStructuralLineParts(line);
    if (!structuralParts) {
        return wrapSelectionText(line, format);
    }

    if (structuralParts.content.length === 0) {
        return line;
    }

    return `${structuralParts.prefix}${wrapSelectionText(structuralParts.content, format)}`;
}

/** Returns the opening and closing delimiter ranges of a wrapped segment, in document order. */
export function getDelimiterRanges(segment: TextRange, format: InlineFormatDefinition): TextRange[] {
    return [
        { from: segment.from, to: segment.from + format.openingDelimiter.length },
        { from: segment.to - format.closingDelimiter.length, to: segment.to },
    ];
}

/**
 * Decides what a cursor at `cursorOffset` does relative to `segments` (same coordinate space):
 * at the opening delimiter it moves inside, at the content end it moves past the closing delimiter,
 * and anywhere else inside (or right after) a segment it unwraps that segment.
 */
export function analyzeCursorAction(
    segments: readonly TextRange[],
    cursorOffset: number,
    format: InlineFormatDefinition
): CursorAction | null {
    const segment = segments.find(
        (wrappedSegment) => cursorOffset >= wrappedSegment.from && cursorOffset <= wrappedSegment.to
    );
    if (!segment) {
        return null;
    }

    if (cursorOffset === segment.from) {
        return { kind: 'move', position: segment.from + format.openingDelimiter.length };
    }

    if (cursorOffset === segment.to - format.closingDelimiter.length) {
        return { kind: 'move', position: segment.to };
    }

    return { kind: 'unwrap', segment };
}
