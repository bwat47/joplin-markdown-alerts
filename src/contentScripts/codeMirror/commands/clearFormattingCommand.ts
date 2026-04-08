import type { SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type PlaceholderStore = {
    create: (value: string) => string;
    restore: (text: string) => string;
};

const PLACEHOLDER_SENTINEL = '\u0000';
const PLACEHOLDER_LABEL = 'MDCLR';
const JOPLIN_RESOURCE_ID_REGEX = /^:\/[0-9a-f]{32}$/i;
const FENCED_CODE_BLOCK_REGEX = /(^|\n)([ \t]*)(```|~~~)[^\n]*\n([\s\S]*?)\n\2\3[ \t]*(?=\n|$)/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const HTML_IMAGE_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const REFERENCE_LINK_DEFINITION_REGEX = /^\s*\[(?!\^)[^\]]+\]:\s*(.+?)\s*$/;
const FOOTNOTE_DEFINITION_REGEX = /^\s*\[\^([^\]]+)\]:?\s*(.*)$/;
const BLOCKQUOTE_PREFIX_REGEX = /^\s*(?:>\s*)+/;
const HEADING_PREFIX_REGEX = /^\s{0,3}#{1,6}[ \t]+/;
const LIST_MARKER_REGEX = /^\s*(?:[-+*]|\d+[.)])\s+/;
const TASK_LIST_MARKER_REGEX = /^\[(?: |x|X)\]\s+/;
const THEMATIC_BREAK_LINE_REGEX = /^\s{0,3}(?:(?:\*(?:[ \t]*\*){2,})|(?:-(?:[ \t]*-){2,})|(?:_(?:[ \t]*_){2,}))\s*$/;
const PLAIN_ALERT_TITLE_LINE_REGEX = new RegExp(`^\\s*\\[!(${GITHUB_ALERT_TYPES.join('|')})\\](?:[ \\t]+(.*))?$`, 'i');
const REFERENCE_STYLE_IMAGE_REGEX = /!\[([^\]]*)\]\[([^\]]+)\]/g;
const REFERENCE_LINK_REGEX = /\[([^\]]+)\]\[[^\]]+\]/g;
const FOOTNOTE_REFERENCE_REGEX = /\[\^([^\]]+)\]/g;
const HTML_FORMATTING_TAGS = ['sup', 'sub', 'u', 's', 'strong', 'b', 'em', 'i', 'mark', 'del', 'strike', 'ins', 'span'];
const MAX_CLEARING_PASSES = 10;

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createPlaceholderStore(sourceText: string): PlaceholderStore {
    const values: string[] = [];
    let nonce = 0;
    let placeholderPrefix = `${PLACEHOLDER_SENTINEL}${PLACEHOLDER_LABEL}${nonce}${PLACEHOLDER_SENTINEL}`;

    while (sourceText.includes(placeholderPrefix)) {
        nonce += 1;
        placeholderPrefix = `${PLACEHOLDER_SENTINEL}${PLACEHOLDER_LABEL}${nonce}${PLACEHOLDER_SENTINEL}`;
    }

    const placeholderPattern = new RegExp(
        `${escapeRegex(placeholderPrefix)}(\\d+)${escapeRegex(PLACEHOLDER_SENTINEL)}`,
        'g'
    );

    return {
        create: (value: string) => {
            const placeholder = `${placeholderPrefix}${values.length}${PLACEHOLDER_SENTINEL}`;
            values.push(value);
            return placeholder;
        },
        restore: (text: string) =>
            text.replace(placeholderPattern, (match, indexText) => {
                const index = Number(indexText);
                return Number.isInteger(index) && values[index] !== undefined ? values[index] : match;
            }),
    };
}

function isResourceLinkTarget(target: string): boolean {
    return JOPLIN_RESOURCE_ID_REGEX.test(target.trim());
}

function findClosingParenthesis(text: string, openParenIndex: number): number {
    let depth = 0;
    let quoteChar: '"' | "'" | null = null;

    for (let index = openParenIndex; index < text.length; index += 1) {
        const char = text[index];

        if (char === '\\') {
            index += 1;
            continue;
        }

        if (quoteChar) {
            if (char === quoteChar) {
                quoteChar = null;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quoteChar = char;
            continue;
        }

        if (char === '(') {
            depth += 1;
            continue;
        }

        if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function extractLinkDestination(rawDestination: string): string | null {
    const trimmed = rawDestination.trim();
    if (trimmed.length === 0) {
        return null;
    }

    if (trimmed.startsWith('<')) {
        const closingIndex = trimmed.indexOf('>');
        if (closingIndex === -1) {
            return null;
        }

        return trimmed.slice(1, closingIndex).trim();
    }

    let parenthesisDepth = 0;
    for (let index = 0; index < trimmed.length; index += 1) {
        const char = trimmed[index];

        if (char === '\\') {
            index += 1;
            continue;
        }

        if (char === '(') {
            parenthesisDepth += 1;
            continue;
        }

        if (char === ')' && parenthesisDepth > 0) {
            parenthesisDepth -= 1;
            continue;
        }

        if (/\s/.test(char) && parenthesisDepth === 0) {
            return trimmed.slice(0, index);
        }
    }

    return trimmed;
}

function replaceFencedCodeBlocks(text: string, store: PlaceholderStore): string {
    return text.replace(
        FENCED_CODE_BLOCK_REGEX,
        (_match, leadingBreak: string, _indent: string, _fence: string, content: string) =>
            `${leadingBreak}${store.create(content)}`
    );
}

function replaceInlineCode(text: string, store: PlaceholderStore): string {
    return text.replace(INLINE_CODE_REGEX, (_match, content: string) => store.create(content));
}

function replaceMarkdownLinksAndImages(text: string, store: PlaceholderStore): string {
    let result = '';
    let index = 0;

    while (index < text.length) {
        const startsImage = text[index] === '!' && text[index + 1] === '[';
        const startsLink = text[index] === '[';

        if (!startsImage && !startsLink) {
            result += text[index];
            index += 1;
            continue;
        }

        const labelStart = startsImage ? index + 1 : index;
        const labelEnd = text.indexOf(']', labelStart + 1);
        if (labelEnd === -1 || text[labelEnd + 1] !== '(') {
            result += text[index];
            index += 1;
            continue;
        }

        const closingParenIndex = findClosingParenthesis(text, labelEnd + 1);
        if (closingParenIndex === -1) {
            result += text[index];
            index += 1;
            continue;
        }

        const fullMatch = text.slice(index, closingParenIndex + 1);
        const destination = extractLinkDestination(text.slice(labelEnd + 2, closingParenIndex));

        if (!destination) {
            result += text[index];
            index += 1;
            continue;
        }

        result += isResourceLinkTarget(destination) ? store.create(fullMatch) : store.create(destination);
        index = closingParenIndex + 1;
    }

    return result;
}

function replaceHtmlImages(text: string, store: PlaceholderStore): string {
    return text.replace(
        HTML_IMAGE_REGEX,
        (match, doubleQuotedSrc: string, singleQuotedSrc: string, bareSrc: string) => {
            const src = (doubleQuotedSrc ?? singleQuotedSrc ?? bareSrc ?? '').trim();
            if (src.length === 0) {
                return match;
            }

            return isResourceLinkTarget(src) ? store.create(match) : store.create(src);
        }
    );
}

function clearAlertTitleLine(line: string): string | null {
    const parsedAlertLine = parseGitHubAlertTitleLine(line);
    if (parsedAlertLine) {
        return 'title' in parsedAlertLine ? parsedAlertLine.title : '';
    }

    const plainAlertMatch = PLAIN_ALERT_TITLE_LINE_REGEX.exec(line);
    if (!plainAlertMatch) {
        return null;
    }

    return plainAlertMatch[2]?.trim() ?? '';
}

function replaceReferenceStyleImages(text: string): string {
    return text.replace(REFERENCE_STYLE_IMAGE_REGEX, (_match, altText: string, target: string) => {
        const trimmedAltText = altText.trim();
        const trimmedTarget = target.trim();

        if (isResourceLinkTarget(trimmedTarget)) {
            return trimmedAltText.length > 0 ? `${trimmedAltText} ${trimmedTarget}` : trimmedTarget;
        }

        return trimmedAltText.length > 0 ? `${trimmedAltText} ${trimmedTarget}` : trimmedTarget;
    });
}

function isThematicBreakLine(line: string): boolean {
    return THEMATIC_BREAK_LINE_REGEX.test(line);
}

function clearStructuralLineFormatting(line: string, store: PlaceholderStore): string {
    const referenceDefinitionMatch = REFERENCE_LINK_DEFINITION_REGEX.exec(line);
    if (referenceDefinitionMatch) {
        const destination = extractLinkDestination(referenceDefinitionMatch[1]);
        if (!destination || isResourceLinkTarget(destination)) {
            return line;
        }

        return store.create(destination);
    }

    const footnoteDefinitionMatch = FOOTNOTE_DEFINITION_REGEX.exec(line);
    if (footnoteDefinitionMatch) {
        return footnoteDefinitionMatch[2].length > 0 ? footnoteDefinitionMatch[2] : footnoteDefinitionMatch[1];
    }

    const clearedAlertTitleLine = clearAlertTitleLine(line);
    if (clearedAlertTitleLine !== null) {
        return clearedAlertTitleLine;
    }

    let updatedLine = line.replace(BLOCKQUOTE_PREFIX_REGEX, '').replace(HEADING_PREFIX_REGEX, '');
    if (isThematicBreakLine(updatedLine)) {
        return updatedLine;
    }
    let strippedListSyntax = false;

    while (true) {
        const withoutListMarker = updatedLine.replace(LIST_MARKER_REGEX, '');
        if (withoutListMarker !== updatedLine) {
            updatedLine = withoutListMarker;
            strippedListSyntax = true;
            continue;
        }

        const withoutTaskMarker = updatedLine.replace(TASK_LIST_MARKER_REGEX, '');
        if (withoutTaskMarker !== updatedLine) {
            updatedLine = withoutTaskMarker;
            strippedListSyntax = true;
            continue;
        }

        break;
    }

    return strippedListSyntax ? updatedLine.trimStart() : updatedLine;
}

function stripPairedHtmlFormattingTags(text: string): string {
    let updatedText = text;

    for (const tagName of HTML_FORMATTING_TAGS) {
        const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
        updatedText = updatedText.replace(regex, '$1');
    }

    return updatedText;
}

function stripMarkdownInlineFormatting(text: string): string {
    return replaceReferenceStyleImages(text)
        .replace(REFERENCE_LINK_REGEX, '$1')
        .replace(FOOTNOTE_REFERENCE_REGEX, '$1')
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
        .replace(/(?<!\w)__(?=\S)([^\n]*?\S)__(?!\w)/g, '$1')
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
        .replace(/==(?=\S)([^\n]*?\S)==/g, '$1')
        .replace(/\+\+(?=\S)([^\n]*?\S)\+\+/g, '$1')
        .replace(/(?<!\w)\^(?=\S)([^\n]*?\S)\^(?!\w)/g, '$1')
        .replace(/(?<!~)(?<!\w)~(?=\S)([^\n]*?\S)~(?!\w)(?!~)/g, '$1')
        .replace(/(?<!\*)\*(?=\S)([^\n*]*?\S)\*(?!\*)/g, '$1')
        .replace(/(?<!\w)_(?=\S)([^\n_]*?\S)_(?!\w)/g, '$1');
}

function createExplicitSelection(range: SelectionRange, updatedTextLength: number): ExplicitCursorSelection {
    const selectionStartsAtRangeStart = range.anchor <= range.head;

    return selectionStartsAtRangeStart
        ? {
              anchorBasePos: range.from,
              anchorOffset: 0,
              headBasePos: range.from,
              headOffset: updatedTextLength,
          }
        : {
              anchorBasePos: range.from,
              anchorOffset: updatedTextLength,
              headBasePos: range.from,
              headOffset: 0,
          };
}

export function clearMarkdownFormattingSelectionText(text: string): string {
    const store = createPlaceholderStore(text);
    let updatedText = replaceFencedCodeBlocks(text, store);
    updatedText = replaceInlineCode(updatedText, store);
    updatedText = replaceMarkdownLinksAndImages(updatedText, store);
    updatedText = replaceHtmlImages(updatedText, store);
    updatedText = updatedText
        .split('\n')
        .map((line) => clearStructuralLineFormatting(line, store))
        .map((line) => (isThematicBreakLine(line) ? store.create(line) : line))
        .join('\n');

    for (let pass = 0; pass < MAX_CLEARING_PASSES; pass += 1) {
        const nextText = stripMarkdownInlineFormatting(stripPairedHtmlFormattingTags(updatedText));
        if (nextText === updatedText) {
            break;
        }
        updatedText = nextText;
    }

    return store.restore(updatedText);
}

export function createClearFormattingCommand(view: EditorView): () => boolean {
    return () => {
        const state = view.state;
        const changes: TextChange[] = [];
        const explicitSelectionsByIndex = new Map<number, ExplicitCursorSelection>();

        state.selection.ranges.forEach((range, index) => {
            if (range.empty) {
                return;
            }

            const selectedText = state.doc.sliceString(range.from, range.to);
            const updatedText = clearMarkdownFormattingSelectionText(selectedText);
            if (updatedText === selectedText) {
                return;
            }

            changes.push({
                from: range.from,
                to: range.to,
                insert: updatedText,
            });
            explicitSelectionsByIndex.set(index, createExplicitSelection(range, updatedText.length));
        });

        if (changes.length === 0) {
            return false;
        }

        dispatchChangesWithSelections(view, changes, explicitSelectionsByIndex);
        view.focus();
        return true;
    };
}
