import type { Node as PMNode } from '@tiptap/pm/model';

export interface InlineMatch {
    from: number;
    text: string;
    to: number;
}

// Find `regex` matches in each textblock's inline text, mapped to document positions. Unlike a per-text-node
// scan, this reunites a token split across text nodes by a mark (e.g. a user styles one brace of `{{.Var}}`,
// so ProseMirror splits it) — the brace and the rest sit in one block string again. ProseMirror positions are
// one per UTF-16 unit and mark-independent, so offset `i` in the block string maps to `blockStart + i`; a
// token never spans a non-text inline node (image/hard-break), so `to = from + length` holds. `regex` MUST be
// global (`/g`). Scanning per textblock — NOT over `doc.textContent` — keeps positions aligned across blocks.
export const collectInlineMatches = (doc: PMNode, regex: RegExp): InlineMatch[] => {
    const matches: InlineMatch[] = [];

    doc.descendants((node, pos) => {
        if (!node.isTextblock) {
            return; // a container — recurse into it to reach its textblocks
        }

        let text = '';
        const positions: number[] = [];
        let inlinePos = pos + 1;

        node.forEach((child) => {
            if (child.isText && child.text) {
                for (let i = 0; i < child.text.length; i += 1) {
                    text += child.text[i];
                    positions.push(inlinePos + i);
                }
            }

            inlinePos += child.nodeSize;
        });

        for (const match of text.matchAll(regex)) {
            const from = positions[match.index ?? 0];

            if (from !== undefined) {
                matches.push({ from, text: match[0], to: from + match[0].length });
            }
        }

        return false; // inline content handled — don't recurse into the text nodes
    });

    return matches;
};
