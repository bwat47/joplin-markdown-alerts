import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

const DEFAULT_SYNTAX_TREE_TIMEOUT = 100;

export type ParagraphRange = {
    from: number;
    to: number;
};

type NodeRange = {
    from: number;
    to: number;
};

export function getSyntaxTree(state: EditorState, position: number, timeoutMs = DEFAULT_SYNTAX_TREE_TIMEOUT) {
    let tree = ensureSyntaxTree(state, position, timeoutMs);
    if (!tree) {
        tree = syntaxTree(state);
    }
    return tree;
}

export function getProbePositions(
    state: EditorState,
    position: number,
    linePrefixPattern?: RegExp
): number[] {
    const line = state.doc.lineAt(position);
    const positions = [position, position + 1];
    if (position > line.from) {
        positions.push(position - 1);
    }

    if (linePrefixPattern) {
        const match = linePrefixPattern.exec(line.text);
        if (match) {
            const afterPrefix = line.from + match[0].length;
            positions.push(afterPrefix);
            positions.push(afterPrefix + 1);
        }
    }

    const max = Math.max(0, state.doc.length);
    return positions
        .map((pos) => Math.min(Math.max(pos, 0), max))
        .filter((pos, index, list) => list.indexOf(pos) === index);
}

export function findParagraphNodeAt(
    state: EditorState,
    tree: ReturnType<typeof syntaxTree>,
    position: number,
    linePrefixPattern?: RegExp
): SyntaxNode | null {
    const positions = getProbePositions(state, position, linePrefixPattern);
    for (const probePosition of positions) {
        let node: SyntaxNode | null = tree.resolveInner(probePosition, -1);
        while (node) {
            if (node.name.toLowerCase() === 'paragraph') {
                return node;
            }
            node = node.parent;
        }

        node = tree.resolveInner(probePosition, 1);
        while (node) {
            if (node.name.toLowerCase() === 'paragraph') {
                return node;
            }
            node = node.parent;
        }
    }

    return null;
}

export function getParagraphLineRange(state: EditorState, node: NodeRange): ParagraphRange {
    const startLine = state.doc.lineAt(node.from);
    const endPos = Math.max(node.from, node.to - 1);
    const endLine = state.doc.lineAt(endPos);
    return { from: startLine.from, to: endLine.to };
}

export function collectParagraphRanges(
    state: EditorState,
    tree: ReturnType<typeof syntaxTree>,
    from: number,
    to: number
): ParagraphRange[] {
    const ranges: ParagraphRange[] = [];
    const seen = new Set<string>();

    tree.iterate({
        from,
        to,
        enter: (node: SyntaxNodeRef) => {
            if (node.name.toLowerCase() !== 'paragraph') {
                return;
            }
            const paragraphRange = getParagraphLineRange(state, node);
            const key = `${paragraphRange.from}:${paragraphRange.to}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            ranges.push(paragraphRange);
        },
    });

    return ranges.sort((a, b) => a.from - b.from);
}
