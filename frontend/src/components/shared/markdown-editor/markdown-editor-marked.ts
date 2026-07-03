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

    instance.use({
        extensions: [
            // @tiptap/markdown runs decodeHtmlEntities (`&lt;`→`<`, `&amp;`→`&`, `&gt;`→`>`, `&quot;`→`"`) on
            // every text token during parse — a module-scope call its `.lexer()`/`.inlineTokens()` path never
            // routes through marked's walkTokens/hooks, so those can't intercept it. Emit each literal `&` as
            // its own text token pre-encoded to `&amp;`; the decode then nets back to the original byte
            // (`&amp;`→`&`), leaving a source `&lt;`/`&amp;quot;` intact instead of collapsing it to `<`/`"`.
            {
                level: 'inline',
                name: 'literalAmpersand',
                start: (src: string) => {
                    const index = src.indexOf('&');

                    return index < 0 ? undefined : index;
                },
                tokenizer: (src: string) =>
                    src[0] === '&' ? { raw: '&', text: '&amp;', type: 'text' as const } : undefined,
            },
        ],
        tokenizer: {
            // These marked tokenizers auto-convert literal text into markup, mangling Go-template / pentest
            // prose on round-trip. Returning `undefined` forces the char to stay literal text; `false` defers
            // to marked's default. Neutralise the lossy cases, keep what the toolbar emits:
            //   • del      — keep GFM `~~strike~~`, drop a lone `~…~` (else `~5~` / ranges become <del>)
            //   • emStrong — keep `*`/`**`, drop `_`-delimited emphasis (else `__init__`/`_word_` become em/strong)
            //   • escape   — keep `\`+punct literal (`\.` `\*` `\|` `\\`); marked's default DROPS the backslash
            //                (CommonMark unescape), silently corrupting regex/paths on the first load
            //   • html/tag — keep `<xml-like>` tags literal (marked swallows real-HTML-element names)
            // NB: autolink/url are intentionally NOT neutralised — a bare `https://…`, `<url>` or email is
            // meant to become a link (see markdown-editor-extensions.ts link config, kept symmetric with typing).
            del: (src: string) => (/^~~(?!~)/.test(src) ? false : undefined),
            emStrong: (src: string) => (/^_/.test(src) ? undefined : false),
            escape: () => undefined,
            html: () => undefined,
            tag: () => undefined,
        },
    });

    // A PRIVATE instance — mutating the shared global `marked` would also affect report-pdf.
    return instance;
};

// The serialize-side counterpart to createFaithfulMarked. @tiptap/markdown's MarkdownManager
// .encodeTextForMarkdown HTML-entity-encodes text (`<` → `&lt;`) and backslash-escapes ``` ` * _ [ ] ~ \ ```.
// Both are wrong here: the load side neutralises marked's escape/html/tag tokenizers, so a `\`-escape or
// `&lt;`-entity is NEVER decoded on parse — anything we encode now resurfaces as a literal backslash / entity
// on the next load, the exact corruption this editor avoids. Serialization is hard-coded in the manager (no
// per-extension hook), so replace that one method with identity, keeping load and save byte-symmetric.
type ManagerWithEncode = { encodeTextForMarkdown: (text: string) => string };

const FaithfulMarkdownText = Extension.create({
    name: 'faithfulMarkdownText',
    onBeforeCreate() {
        const manager = this.editor.markdown as unknown as ManagerWithEncode | undefined;

        if (!manager) {
            return;
        }

        manager.encodeTextForMarkdown = (text) => text;
    },
    // Lower priority than the Markdown extension so this runs AFTER its onBeforeCreate has created the
    // manager and assigned editor.markdown. onBeforeCreate (not onCreate) because it is synchronous —
    // a headless editor's onCreate fires after construction, too late for the first getMarkdown().
    priority: 50,
});

// @tiptap/extension-table's renderTableToMarkdown is alignment-aware but never escapes pipes, so a literal
// `|` a cell emits (even from inside inline code) would re-parse as a column delimiter on the next SAVE and
// drop cells (tiptap PR #7884). renderTableToMarkdown emits cell content only via h.renderChildren, so wrapping
// that one call to escape pipes fixes the save side, on the official alignment-aware renderer.
// This does NOT (and cannot) help the LOAD side: a raw `|` inside inline code arriving in external markdown is
// split by marked's GFM table tokenizer BEFORE the inline-code tokenizer runs — a marked limitation.
type RenderHelpers = { renderChildren: (nodes: JSONContent | JSONContent[], separator?: string) => string };

export const MarkdownTable = Table.extend({
    renderMarkdown(node: JSONContent, helpers: RenderHelpers) {
        const pipeEscaping: RenderHelpers = {
            ...helpers,
            renderChildren: (nodes, separator) => helpers.renderChildren(nodes, separator).replace(/\|/g, '\\|'),
        };

        return renderTableToMarkdown(node, pipeEscaping as Parameters<typeof renderTableToMarkdown>[1]);
    },
});

export const createMarkdownLayer = () => [
    Markdown.configure({ marked: createFaithfulMarked() as unknown as typeof import('marked').marked }),
    FaithfulMarkdownText,
];
