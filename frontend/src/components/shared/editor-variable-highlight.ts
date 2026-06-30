import type { Node as PMNode } from '@tiptap/pm/model';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { collectInlineMatches } from './editor-inline-scan';

// Highlights Go-template actions ({{.Var}}, {{- if .X}}, {{end}}, {{.A | upper}}, …) as VIEW-ONLY
// decorations. Decorations never touch the document, so getMarkdown() stays byte-identical, and {{ }}
// already round-trips verbatim. A node/mark would gain nothing here and would break the variables
// side-panel, which inserts {{.X}} as plain text and finds its uses by scanning, not by node identity.
const variableHighlightKey = new PluginKey('variableHighlight');

// `[^{}]` keeps the scan linear (no catastrophic backtracking); Go actions never nest braces.
export const VARIABLE_RE = /\{\{[^{}]*\}\}/g;

// Matches one variable's `{{ … .Name … }}` use. Shared with settings-prompt.tsx (panel cycle + count) so the
// panel's "used" badge and the editor cycle agree on what counts as a use.
export const variableUseRegex = (variable: string): RegExp =>
    new RegExp(`\\{\\{[^{}]*?\\.${variable}\\b[^{}]*?\\}\\}`, 'g');

const buildDecorations = (doc: PMNode): DecorationSet =>
    DecorationSet.create(
        doc,
        collectInlineMatches(doc, VARIABLE_RE).map(({ from, to }) =>
            Decoration.inline(from, to, { class: 'template-variable' }),
        ),
    );

export const findVariableOccurrences = (doc: PMNode, variable: string): { from: number; to: number }[] =>
    collectInlineMatches(doc, variableUseRegex(variable)).map(({ from, to }) => ({ from, to }));

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
