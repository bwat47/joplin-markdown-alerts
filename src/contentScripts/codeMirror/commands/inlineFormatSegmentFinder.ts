import type { EditorState, Line } from '@codemirror/state';
import type { Tree } from '@lezer/common';

import type { InlineFormatDefinition } from '../../../inlineFormatCommands';
import type { TextRange } from '../shared/commandRangeUtils';
import { getSyntaxTree } from '../shared/syntaxTreeUtils';
import { findWrappedSegments } from './inlineFormatText';

/** Returns the target-format segments (absolute document ranges) in the inline scope containing a line. */
export type InlineFormatSegmentFinder = (line: Line) => TextRange[];

const PARAGRAPH_NODE_NAME = 'Paragraph';

/**
 * Nodes whose characters can never be part of an inline format delimiter: inline code and code blocks
 * are literal text, and quote marks are the `>` prefixes of continuation lines inside a multi-line
 * paragraph.
 */
const NON_DELIMITER_NODE_NAMES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'QuoteMark']);

function findParagraphOnLine(tree: Tree, line: Line): TextRange | null {
    let paragraph: TextRange | null = null;

    tree.iterate({
        from: line.from,
        to: line.to,
        enter: (node) => {
            if (paragraph) {
                return false;
            }

            const isParagraph = node.name === PARAGRAPH_NODE_NAME;
            if (isParagraph && node.from < line.to && node.to > line.from) {
                paragraph = { from: node.from, to: node.to };
            }

            return !isParagraph;
        },
    });

    return paragraph;
}

function collectNonDelimiterRanges(tree: Tree, scope: TextRange): TextRange[] {
    const ranges: TextRange[] = [];

    tree.iterate({
        from: scope.from,
        to: scope.to,
        enter: (node) => {
            if (!NON_DELIMITER_NODE_NAMES.has(node.name)) {
                return true;
            }

            const from = Math.max(node.from, scope.from) - scope.from;
            const to = Math.min(node.to, scope.to) - scope.from;
            if (from < to) {
                ranges.push({ from, to });
            }
            return false;
        },
    });

    return ranges;
}

/**
 * Creates a segment finder for one command invocation. A line's inline scope is the paragraph that
 * contains it, so segments can span soft line breaks; lines outside paragraphs (headings, table rows,
 * code) are scanned on their own. Results are cached per scope for the lifetime of the finder.
 */
export function createInlineFormatSegmentFinder(
    state: EditorState,
    format: InlineFormatDefinition
): InlineFormatSegmentFinder {
    const segmentsByScope = new Map<string, TextRange[]>();

    return (line) => {
        const tree = getSyntaxTree(state, line.to);
        const scope = findParagraphOnLine(tree, line) ?? { from: line.from, to: line.to };
        const scopeKey = `${scope.from}:${scope.to}`;
        const cachedSegments = segmentsByScope.get(scopeKey);
        if (cachedSegments) {
            return cachedSegments;
        }

        const scopeText = state.doc.sliceString(scope.from, scope.to);
        const segments = findWrappedSegments(scopeText, format, collectNonDelimiterRanges(tree, scope)).map(
            (segment) => ({ from: segment.from + scope.from, to: segment.to + scope.from })
        );
        segmentsByScope.set(scopeKey, segments);
        return segments;
    };
}
