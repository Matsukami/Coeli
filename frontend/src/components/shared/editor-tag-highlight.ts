import type { Node as PMNode } from '@tiptap/pm/model';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Highlights xml-like tags (<container_environment>, </language_policy>, <specialist name="x">)
// as VIEW-ONLY decorations — same byte-neutral approach as editor-variable-highlight. A node would
// have to tell a structural tag from a tag NAME quoted inline as documentation (the prompts do both,
// in prose AND code), which can't be done reliably and risks corrupting the template on save; a
// decoration colours any tag-shaped text wherever it appears and never touches the document.
const tagHighlightKey = new PluginKey('tagHighlight');

// `[^<>]` for the attribute span keeps the scan linear and stops at the next angle bracket.
export const TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;

const buildDecorations = (doc: PMNode): DecorationSet => {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) {
            return;
        }

        for (const match of node.text.matchAll(TAG_RE)) {
            const from = pos + (match.index ?? 0);

            decorations.push(Decoration.inline(from, from + match[0].length, { class: 'template-tag' }));
        }
    });

    return DecorationSet.create(doc, decorations);
};

export const TagHighlight = Extension.create({
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: tagHighlightKey,
                props: {
                    decorations(state) {
                        return tagHighlightKey.getState(state);
                    },
                },
                state: {
                    apply: (tr, old: DecorationSet) => (tr.docChanged ? buildDecorations(tr.doc) : old),
                    init: (_config, { doc }) => buildDecorations(doc),
                },
            }),
        ];
    },
    name: 'tagHighlight',
});
