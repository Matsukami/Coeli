import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const HEADING_MARKER = /^(#{1,6}) /;

// The heading input-rule fires only on the keystroke that types `# ` at a block start; a block that comes to
// start with `# ` any other way — deleting the text before an existing `#`, Enter in front of it, paste — stays
// a paragraph, unlike CommonMark (a leading ATX marker IS a heading) and unlike what that same text becomes on
// the next load. This plugin promotes such a paragraph to the matching heading on every doc-changing transaction.
// It keys off the FIRST child, not textContent: a `# ` after a hardBreak (Shift+Enter) must stay body text, and
// there the first child is the pre-break text, so the block correctly does not read as starting with `#`.
export const HeadingAutoformat = Extension.create({
    addProseMirrorPlugins() {
        return [
            new Plugin({
                appendTransaction(transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState) {
                    if (!transactions.some((transaction) => transaction.docChanged)) {
                        return null;
                    }

                    const heading = newState.schema.nodes.heading;
                    const paragraph = newState.schema.nodes.paragraph;

                    if (!heading || !paragraph) {
                        return null;
                    }

                    const targets: { level: number; markerEnd: number; start: number }[] = [];

                    newState.doc.descendants((node: PMNode, pos: number) => {
                        if (node.type !== paragraph) {
                            return true;
                        }

                        const first = node.firstChild;
                        const match = first?.isText && first.text ? HEADING_MARKER.exec(first.text) : null;

                        if (match) {
                            const start = pos + 1;
                            const $start = newState.doc.resolve(start);

                            if ($start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), heading)) {
                                targets.push({ level: match[1]!.length, markerEnd: start + match[0].length, start });
                            }
                        }

                        return false;
                    });

                    if (targets.length === 0) {
                        return null;
                    }

                    const tr = newState.tr;

                    // High position → low so each edit leaves the earlier, not-yet-applied positions valid.
                    for (const { level, markerEnd, start } of targets.reverse()) {
                        tr.delete(start, markerEnd).setBlockType(start, start, heading, { level });
                    }

                    return tr;
                },
                key: new PluginKey('headingAutoformat'),
            }),
        ];
    },
    name: 'headingAutoformat',
});
