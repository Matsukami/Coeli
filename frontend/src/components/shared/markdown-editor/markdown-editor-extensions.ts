import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import { createMarkdownLayer, MarkdownTable } from './markdown-editor-marked';
import { MarkdownPaste } from './markdown-editor-paste';
import { TagHighlight } from './markdown-editor-tag-highlight';
import { VariableHighlight } from './markdown-editor-variable-highlight';

const dropUnderscore = (rules: { find: unknown }[]) =>
    rules.filter((rule) => !(rule.find instanceof RegExp && rule.find.source.includes('_')));

interface MarkdownCodeToken {
    codeBlockStyle?: string;
    lang?: string;
    raw?: string;
    text?: string;
}

interface MarkdownParseHelpers {
    createNode: (type: string, attrs: Record<string, unknown>, content: unknown[]) => unknown;
    createTextNode: (text: string) => unknown;
}

interface MarkdownRenderHelpers {
    renderChildren: (content: unknown) => string;
}

type MarkdownRenderNode = { attrs?: { language?: null | string }; content?: unknown };

const longestBacktickRun = (text: string): number =>
    (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);

// @tiptap/extension-code-block's renderMarkdown always emits a 3-backtick fence, so a code block whose content
// contains a ``` line (a doc demonstrating fenced markdown — common in knowledge/prompt examples) re-parses as
// TWO blocks on the next load: the inner fence closes the outer one. CommonMark requires the fence to be longer
// than any backtick run inside — widen it. Otherwise identical to upstream.
const renderTunedCodeBlock = (node: MarkdownRenderNode, helpers: MarkdownRenderHelpers): string => {
    const language = node.attrs?.language || '';

    if (!node.content) {
        return `\`\`\`${language}\n\n\`\`\``;
    }

    const content = helpers.renderChildren(node.content);
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1));

    return [`${fence}${language}`, content, fence].join('\n');
};

// @tiptap/extension-code-block's own parseMarkdown gates on `token.raw.startsWith('```')`, but CommonMark
// lets a fenced code block's opening fence be indented up to 3 spaces — marked then emits a valid `code`
// token whose `raw` starts with that whitespace, the gate rejects it, and the block is dropped on load. When
// a document mixes fences at different indents the mis-detection cascades and everything after the first
// dropped fence vanishes too. Trim the leading indent before the gate; otherwise identical to upstream.
const parseTunedCodeBlock = (token: MarkdownCodeToken, helpers: MarkdownParseHelpers): unknown => {
    const fence = token.raw?.trimStart() ?? '';

    if (!fence.startsWith('```') && !fence.startsWith('~~~') && token.codeBlockStyle !== 'indented') {
        return [];
    }

    return helpers.createNode(
        'codeBlock',
        { language: token.lang || null },
        token.text ? [helpers.createTextNode(token.text)] : [],
    );
};

// StarterKit's Bold/Italic register BOTH `**`/`*` and `__`/`_` input+paste rules. The marked layer keeps
// `_`-emphasis literal on load/paste, so leaving the underscore TYPING rules on would diverge — typed
// `__init__`/`_word_` would emphasize (→ `**init**`/`*word*`) while the same text loaded stays literal,
// breaking identifiers. Drop only the underscore rules (their `find` regex mentions `_`; the `*` rules stay)
// so typing matches load. codeBlock gets the indented-fence fix above. (Underline off below.)
const StarterKitTuned = StarterKit.extend({
    addExtensions() {
        return (this.parent?.() ?? []).map((extension) => {
            if (extension.name === 'bold' || extension.name === 'italic') {
                return extension.extend({
                    addInputRules() {
                        return dropUnderscore(this.parent?.() ?? []);
                    },
                    addPasteRules() {
                        return dropUnderscore(this.parent?.() ?? []);
                    },
                });
            }

            if (extension.name === 'codeBlock') {
                return extension.extend({
                    parseMarkdown: parseTunedCodeBlock,
                    renderMarkdown: renderTunedCodeBlock,
                } as Parameters<typeof extension.extend>[0]);
            }

            return extension;
        });
    },
});

// Single source of truth for the editor's extension stack — shared by markdown-editor.tsx AND the
// round-trip tests so they can never drift. createMarkdownLayer is the official @tiptap/markdown layer
// tuned for our content (see markdown-editor-marked.ts); VariableHighlight/TagHighlight are view-only decorations
// ({{vars}} / <tags>) that don't affect serialization.
//   • underline: false — its `++text++` markdown corrupts `C++ … C++` prose on load and Ctrl+U emits `++`.
//   • link autolink/linkOnPaste: true — a bare URL/email becomes a link on load, paste, AND typing, kept
//     symmetric with the marked layer (which no longer neutralises autolink/url). Do NOT set false: it
//     diverges typing from load and re-freezes bare URLs as text.
export const createMarkdownExtensions = (placeholder?: string) => [
    StarterKitTuned.configure({
        codeBlock: { HTMLAttributes: { class: 'hljs' } },
        link: { autolink: true, linkOnPaste: true },
        underline: false,
    }),
    MarkdownTable.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
    VariableHighlight,
    TagHighlight,
    Placeholder.configure({ emptyEditorClass: 'is-editor-empty', placeholder }),
    ...createMarkdownLayer(),
    MarkdownPaste,
];
