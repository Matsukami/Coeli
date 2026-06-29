import type { Node as PMNode } from '@tiptap/pm/model';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Highlights Go-template actions ({{.Var}}, {{- if .X}}, {{end}}, {{.A | upper}}, …) as
// VIEW-ONLY decorations. Decorations never touch the document, so getMarkdown() stays
// byte-identical — and {{ }} already round-trips verbatim (prosemirror-markdown esc()
// escapes only ` * \ ~ [ ] _, tiptap-markdown escapeHTML only < >; neither touches { }).
// A node/mark would gain nothing here and would break the variables side-panel, which
// inserts {{.X}} as plain text and cycles uses by regex over the serialized string.
const variableHighlightKey = new PluginKey('variableHighlight');

// `[^{}]` keeps the scan linear (no catastrophic backtracking); Go actions never nest braces.
export const VARIABLE_RE = /\{\{[^{}]*\}\}/g;

// Scan per text node — NOT over doc.textContent — or inline positions misalign across blocks.
const buildDecorations = (doc: PMNode): DecorationSet => {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) {
            return;
        }

        for (const match of node.text.matchAll(VARIABLE_RE)) {
            const from = pos + (match.index ?? 0);

            decorations.push(Decoration.inline(from, from + match[0].length, { class: 'template-variable' }));
        }
    });

    return DecorationSet.create(doc, decorations);
};

export const VariableHighlight = Extension.create({
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: variableHighlightKey,
                props: {
                    decorations(state) {
                        return variableHighlightKey.getState(state);
                    },
                },
                state: {
                    apply: (tr, old: DecorationSet) => (tr.docChanged ? buildDecorations(tr.doc) : old),
                    init: (_config, { doc }) => buildDecorations(doc),
                },
            }),
        ];
    },
    name: 'variableHighlight',
});
