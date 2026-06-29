import type { JSONContent } from '@tiptap/core';

import { Extension } from '@tiptap/core';
import { renderTableToMarkdown, Table } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';

// @tiptap/markdown parses with `marked`, which — unlike markdown-it's `html: false` — always tries to
// interpret `<...>` as HTML. Our content uses literal XML-ish tags (`<container_environment>`, `<input>`)
// that must survive verbatim; marked silently swallows the ones whose names match real HTML elements
// (`<input>`, `<br>`, …). Neutralising marked's block (`html`) and inline (`tag`) HTML tokenizers makes
// every `<...>` fall through to plain text, recreating markdown-it's `html: false`.
const createFaithfulMarked = () => {
    const instance = new Marked();

    instance.use({ tokenizer: { html: () => undefined, tag: () => undefined } });

    // A PRIVATE instance — mutating the shared global `marked` would also affect report-pdf.
    return instance;
};

// marked-side parsing keeps tags literal; this is the serialize-side counterpart. @tiptap/markdown's
// MarkdownManager.encodeTextForMarkdown HTML-entity-encodes text (`<` → `&lt;`) and backslash-escapes
// ``` ` * _ [ ] ~ ``` — both corrupt our content (tags become entities, `[1-1000]`/`*.php`/`snake_case`
// gain stray backslashes). Text serialization is hard-coded in the manager (no per-extension hook), so we
// retune that one method: drop the entity-encoding entirely, and backslash-escape only the chars that
// would otherwise re-parse as inline syntax (`` ` ``, `~`, `\`).
const faithfulEscape = (text: string): string => text.replace(/([\\`~])/g, '\\$1');

type ManagerWithEncode = {
    codeTypes: Set<string>;
    encodeTextForMarkdown: (text: string, node: MarkdownNode, parentNode?: MarkdownNode) => string;
};
type MarkdownNode = { marks?: (string | { type: string })[]; text?: string; type?: string };

export const FaithfulMarkdownText = Extension.create({
    name: 'faithfulMarkdownText',
    onBeforeCreate() {
        const manager = this.editor.markdown as unknown as ManagerWithEncode | undefined;

        if (!manager) {
            return;
        }

        manager.encodeTextForMarkdown = function encodeTextForMarkdown(text, node, parentNode) {
            const isInsideCode =
                (parentNode?.type != null && this.codeTypes.has(parentNode.type)) ||
                (node.marks ?? []).some((mark) => this.codeTypes.has(typeof mark === 'string' ? mark : mark.type));

            return isInsideCode ? text : faithfulEscape(text);
        };
    },
    // Lower priority than the Markdown extension so this runs AFTER its onBeforeCreate has created the
    // manager and assigned editor.markdown. onBeforeCreate (not onCreate) because it is synchronous —
    // a headless editor's onCreate fires after construction, too late for the first getMarkdown().
    priority: 50,
});

// @tiptap/extension-table's renderTableToMarkdown is alignment-aware but never escapes pipes, so a literal
// `|` in a cell (even inside inline code) re-parses as a column delimiter on the next save and drops cells
// (tiptap PR #7884, still open). renderTableToMarkdown only emits cell content via h.renderChildren, so
// wrapping that one call to escape pipes is enough — and it stays on the official, alignment-aware renderer.
type RenderHelpers = { renderChildren: (nodes: JSONContent | JSONContent[], separator?: string) => string };

export const MarkdownTable = Table.extend({
    renderMarkdown(node: JSONContent, helpers: RenderHelpers) {
        const pipeEscaping: RenderHelpers = {
            ...helpers,
            renderChildren: (nodes, separator) => helpers.renderChildren(nodes, separator).replace(/\|/g, '\\|'),
        };

        return renderTableToMarkdown(node, pipeEscaping as never);
    },
});

// The official Markdown extension wired with our faithful `marked`, plus the serialize-side retune.
// The `as never` bridges a transitive version skew: @tiptap/markdown's `marked` option is typed against
// its own marked@17 while our direct dep is marked@18; the instance is runtime-compatible (corpus-verified).
export const createMarkdownLayer = () => [
    Markdown.configure({ marked: createFaithfulMarked() as never }),
    FaithfulMarkdownText,
];
