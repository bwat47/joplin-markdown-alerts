import type { SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { GFM, parser, Subscript, Superscript } from '@lezer/markdown';

import { GITHUB_ALERT_TYPES, parseGitHubAlertTitleLine } from '../alerts/alertParsing';
import { dispatchChangesWithSelections, type ExplicitCursorSelection } from '../shared/commandSelectionUtils';

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type FormattingEdit = TextChange & {
    priority: number;
};

type PlaceholderStore = {
    create: (value: string) => string;
    restore: (text: string) => string;
};

const PLACEHOLDER_SENTINEL = '\u0000';
const PLACEHOLDER_LABEL = 'MDCLR';
const JOPLIN_RESOURCE_ID_REGEX = /^:\/[0-9a-f]{32}$/i;
const HTML_IMAGE_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const URL_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;
const REFERENCE_LINK_DEFINITION_REGEX = /^\s*\[(?!\^)[^\]]+\]:\s*(.+?)\s*$/;
const FOOTNOTE_DEFINITION_REGEX = /^\s*\[\^([^\]]+)\]:?\s*(.*)$/;
const BLOCKQUOTE_PREFIX_REGEX = /^\s*(?:>\s*)+/;
const HEADING_PREFIX_REGEX = /^\s{0,3}#{1,6}[ \t]+/;
const LIST_MARKER_REGEX = /^\s*(?:[-+*]|\d+[.)])\s+/;
const TASK_LIST_MARKER_REGEX = /^\[(?: |x|X)\]\s+/;
const PLAIN_ALERT_TITLE_LINE_REGEX = new RegExp(`^\\s*\\[!(${GITHUB_ALERT_TYPES.join('|')})\\](?:[ \\t]+(.*))?$`, 'i');
const REFERENCE_STYLE_IMAGE_REGEX = /!\[([^\]]*)\]\[([^\]]+)\]/g;
const REFERENCE_LINK_REGEX = /\[([^\]]+)\]\[[^\]]+\]/g;
const FOOTNOTE_REFERENCE_REGEX = /[ \t]?\[\^[^\]]+\]/g;
const HTML_FORMATTING_TAGS = ['sup', 'sub', 'u', 's', 'strong', 'b', 'em', 'i', 'mark', 'del', 'strike', 'ins', 'span'];
const MAX_CLEARING_PASSES = 10;
const MARKDOWN_PARSER = parser.configure([GFM, Superscript, Subscript]);
const SEMANTIC_EDIT_PRIORITY = 100;
const STRUCTURAL_MARK_EDIT_PRIORITY = 20;
const INLINE_MARK_EDIT_PRIORITY = 10;
const INLINE_MARK_NODE_NAMES = new Set(['EmphasisMark', 'StrikethroughMark', 'SuperscriptMark', 'SubscriptMark']);
const STRUCTURAL_MARK_NODE_NAMES = new Set(['QuoteMark', 'HeaderMark', 'ListMark', 'TaskMarker']);
const SEMANTIC_NODE_NAMES = new Set(['FencedCode', 'InlineCode', 'LinkReference', 'Link', 'Image', 'HorizontalRule']);

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

function isUrlLikeText(text: string): boolean {
    return URL_SCHEME_REGEX.test(text.trim());
}

function getNodeText(text: string, node: SyntaxNode | SyntaxNodeRef): string {
    return text.slice(node.from, node.to);
}

function findChildNode(node: SyntaxNode, name: string): SyntaxNode | null {
    const cursor = node.cursor();
    if (!cursor.firstChild()) {
        return null;
    }

    do {
        if (cursor.name === name) {
            return cursor.node;
        }
    } while (cursor.nextSibling());

    return null;
}

function findChildNodes(node: SyntaxNode, name: string): SyntaxNode[] {
    const nodes: SyntaxNode[] = [];
    const cursor = node.cursor();
    if (!cursor.firstChild()) {
        return nodes;
    }

    do {
        if (cursor.name === name) {
            nodes.push(cursor.node);
        }
    } while (cursor.nextSibling());

    return nodes;
}

function expandRangeRightOverInlineWhitespace(text: string, from: number, to: number): { from: number; to: number } {
    let expandedTo = to;
    while (expandedTo < text.length && text[expandedTo] !== '\n' && /[ \t]/.test(text[expandedTo])) {
        expandedTo += 1;
    }

    return { from, to: expandedTo };
}

function expandLinePrefixRange(text: string, markerFrom: number, markerTo: number): { from: number; to: number } {
    const lineStart = text.lastIndexOf('\n', markerFrom - 1) + 1;
    return expandRangeRightOverInlineWhitespace(text, lineStart, markerTo);
}

function parseCompleteBracketLabel(labelSource: string): string | null {
    if (!labelSource.startsWith('[') || !labelSource.endsWith(']')) {
        return null;
    }

    return labelSource.slice(1, -1);
}

function getFencedCodeContent(text: string, node: SyntaxNode): string {
    const codeTextNode = findChildNode(node, 'CodeText');
    if (!codeTextNode) {
        return '';
    }

    return getNodeText(text, codeTextNode);
}

function getInlineCodeContent(text: string, node: SyntaxNode): string {
    const codeMarks = findChildNodes(node, 'CodeMark');
    if (codeMarks.length >= 2) {
        const firstCodeMark = codeMarks[0];
        const lastCodeMark = codeMarks[codeMarks.length - 1];
        return text.slice(firstCodeMark.to, lastCodeMark.from);
    }

    return getNodeText(text, node);
}

function getDirectUrlDestination(text: string, node: SyntaxNode): string | null {
    const urlNode = findChildNode(node, 'URL');
    if (!urlNode) {
        return null;
    }

    return getNodeText(text, urlNode).trim();
}

function getReferenceLabelText(text: string, node: SyntaxNode): string | null {
    const linkMarks = findChildNodes(node, 'LinkMark');
    if (linkMarks.length < 2) {
        return null;
    }

    return text.slice(linkMarks[0].to, linkMarks[1].from).trim();
}

function createFootnoteReferenceEdit(text: string, node: SyntaxNode, label: string): FormattingEdit | null {
    if (!label.startsWith('^')) {
        return null;
    }

    const editFrom = node.from > 0 && /[ \t]/.test(text[node.from - 1]) ? node.from - 1 : node.from;
    return {
        from: editFrom,
        to: node.to,
        insert: '',
        priority: SEMANTIC_EDIT_PRIORITY,
    };
}

function createDirectLinkOrImageEdit(text: string, node: SyntaxNode, store: PlaceholderStore): FormattingEdit | null {
    const source = getNodeText(text, node);
    if (PLAIN_ALERT_TITLE_LINE_REGEX.test(source)) {
        return null;
    }

    const directDestination = getDirectUrlDestination(text, node);
    if (!directDestination) {
        return null;
    }

    if (node.name === 'Link' && text[node.to] === ':') {
        return null;
    }

    return {
        from: node.from,
        to: node.to,
        insert: store.create(isResourceLinkTarget(directDestination) ? source : directDestination),
        priority: SEMANTIC_EDIT_PRIORITY,
    };
}

function createReferenceStyleLinkOrImageEdit(text: string, node: SyntaxNode): FormattingEdit | null {
    if (node.name === 'Link' && text[node.to] === ':') {
        return null;
    }

    const source = getNodeText(text, node);
    if (PLAIN_ALERT_TITLE_LINE_REGEX.test(source)) {
        return null;
    }

    const label = getReferenceLabelText(text, node);
    if (label === null) {
        return null;
    }

    const footnoteReferenceEdit = createFootnoteReferenceEdit(text, node, label);
    if (footnoteReferenceEdit) {
        return footnoteReferenceEdit;
    }

    return {
        from: node.from,
        to: node.to,
        insert: label,
        priority: SEMANTIC_EDIT_PRIORITY,
    };
}

function createLinkOrImageEdit(text: string, node: SyntaxNode, store: PlaceholderStore): FormattingEdit | null {
    return createDirectLinkOrImageEdit(text, node, store) ?? createReferenceStyleLinkOrImageEdit(text, node);
}

function createLinkReferenceEdit(text: string, node: SyntaxNode, store: PlaceholderStore): FormattingEdit | null {
    const labelNode = findChildNode(node, 'LinkLabel');
    const destination = getDirectUrlDestination(text, node);
    const label = labelNode ? parseCompleteBracketLabel(getNodeText(text, labelNode)) : null;

    if (label?.startsWith('^')) {
        const replacement =
            destination && destination.length > 0
                ? isUrlLikeText(destination)
                    ? store.create(destination)
                    : applyLezerFormattingEdits(destination, store)
                : label.slice(1);

        return {
            from: node.from,
            to: node.to,
            insert: replacement,
            priority: SEMANTIC_EDIT_PRIORITY,
        };
    }

    if (!destination || isResourceLinkTarget(destination)) {
        return null;
    }

    return {
        from: node.from,
        to: node.to,
        insert: store.create(destination),
        priority: SEMANTIC_EDIT_PRIORITY,
    };
}

function createSemanticNodeEdit(text: string, node: SyntaxNode, store: PlaceholderStore): FormattingEdit | null {
    if (node.name === 'HorizontalRule') {
        return {
            from: node.from,
            to: node.to,
            insert: '',
            priority: SEMANTIC_EDIT_PRIORITY,
        };
    }

    if (node.name === 'FencedCode') {
        return {
            from: node.from,
            to: node.to,
            insert: store.create(getFencedCodeContent(text, node)),
            priority: SEMANTIC_EDIT_PRIORITY,
        };
    }

    if (node.name === 'InlineCode') {
        return {
            from: node.from,
            to: node.to,
            insert: store.create(getInlineCodeContent(text, node)),
            priority: SEMANTIC_EDIT_PRIORITY,
        };
    }

    if (node.name === 'LinkReference') {
        return createLinkReferenceEdit(text, node, store);
    }

    if (node.name === 'Link' || node.name === 'Image') {
        return createLinkOrImageEdit(text, node, store);
    }

    return null;
}

function createMarkNodeEdit(text: string, node: SyntaxNodeRef): FormattingEdit | null {
    if (INLINE_MARK_NODE_NAMES.has(node.name)) {
        return {
            from: node.from,
            to: node.to,
            insert: '',
            priority: INLINE_MARK_EDIT_PRIORITY,
        };
    }

    if (!STRUCTURAL_MARK_NODE_NAMES.has(node.name)) {
        return null;
    }

    const range =
        node.name === 'QuoteMark' || node.name === 'ListMark'
            ? expandLinePrefixRange(text, node.from, node.to)
            : expandRangeRightOverInlineWhitespace(text, node.from, node.to);

    return {
        ...range,
        insert: '',
        priority: STRUCTURAL_MARK_EDIT_PRIORITY,
    };
}

function rangesOverlap(first: TextChange, second: TextChange): boolean {
    return first.from < second.to && second.from < first.to;
}

function selectNonOverlappingEdits(edits: FormattingEdit[]): TextChange[] {
    const selected: FormattingEdit[] = [];
    const sortedEdits = [...edits].sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }

        const lengthDifference = b.to - b.from - (a.to - a.from);
        if (lengthDifference !== 0) {
            return lengthDifference;
        }

        return a.from - b.from;
    });

    for (const edit of sortedEdits) {
        if (edit.from === edit.to && edit.insert.length === 0) {
            continue;
        }

        if (selected.some((selectedEdit) => rangesOverlap(edit, selectedEdit))) {
            continue;
        }

        selected.push(edit);
    }

    return selected.sort((a, b) => b.from - a.from);
}

function applyTextEdits(text: string, edits: TextChange[]): string {
    let updatedText = text;

    // Edits are pre-sorted right-to-left so each range still refers to offsets in the original text.
    for (const edit of edits) {
        updatedText = `${updatedText.slice(0, edit.from)}${edit.insert}${updatedText.slice(edit.to)}`;
    }

    return updatedText;
}

function applyLezerFormattingEdits(text: string, store: PlaceholderStore): string {
    const tree = MARKDOWN_PARSER.parse(text);
    const edits: FormattingEdit[] = [];

    tree.iterate({
        enter: (node: SyntaxNodeRef) => {
            if (SEMANTIC_NODE_NAMES.has(node.name)) {
                const edit = createSemanticNodeEdit(text, node.node, store);
                if (edit) {
                    edits.push(edit);
                }
                return false;
            }

            const markEdit = createMarkNodeEdit(text, node);
            if (markEdit) {
                edits.push(markEdit);
            }
        },
    });

    return applyTextEdits(text, selectNonOverlappingEdits(edits));
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
    // Complete reference-style images are handled from Lezer Image nodes first; this catches partial selections or
    // malformed-but-obvious fragments that remain as text.
    return text.replace(REFERENCE_STYLE_IMAGE_REGEX, (_match, altText: string) => altText.trim());
}

function clearStructuralLineFormatting(line: string, store: PlaceholderStore): string {
    // Lezer removes complete structural markers first. This line pass keeps selected fragments and parser-missed
    // alert/reference/footnote lines compatible with the previous command behavior.
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
    // Lezer handles complete reference-style links/images and footnotes first. These regexes remain as fallbacks for
    // partial selections like "See [label][id]" without its definition, malformed-but-obvious bracket syntax, and
    // plugin-only inline formats that the parser does not recognize.
    return replaceReferenceStyleImages(text)
        .replace(REFERENCE_LINK_REGEX, '$1')
        .replace(FOOTNOTE_REFERENCE_REGEX, '')
        .replace(/==(?=\S)([^\n]*?\S)==/g, '$1')
        .replace(/\+\+(?=\S)([^\n]*?\S)\+\+/g, '$1');
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
    let updatedText = applyLezerFormattingEdits(text, store);
    updatedText = replaceHtmlImages(updatedText, store);
    updatedText = updatedText
        .split('\n')
        .map((line) => clearStructuralLineFormatting(line, store))
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
