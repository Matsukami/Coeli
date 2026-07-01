import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// @tiptap/markdown parses markdown for load/insertContent but never for the clipboard, so a paste of block
// markdown (# ## - 1. | >) would land as literal text (only StarterKit's inline mark paste-rules fire).
// Route plain-text pastes through the same markdown layer as load; defer to ProseMirror's own path for rich
// sources — an in-editor copy (carries `data-pm-slice`) or web/Office HTML (block tags) — so their fidelity
// survives, and keep pastes inside code literal.
const RICH_HTML_BLOCK = /<(?:h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|img|hr)\b/i;

export const MarkdownPaste = Extension.create({
    addProseMirrorPlugins() {
        const { editor } = this;

        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste(view, event) {
                        const text = event.clipboardData?.getData('text/plain') ?? '';

                        if (!text.trim()) {
                            return false;
                        }

                        const html = event.clipboardData?.getData('text/html') ?? '';

                        if (html.includes('data-pm-slice') || RICH_HTML_BLOCK.test(html)) {
                            return false;
                        }

                        if (view.state.selection.$from.parent.type.spec.code || editor.isActive('code')) {
                            return false;
                        }

                        return editor.commands.insertContent(text, { contentType: 'markdown' });
                    },
                },
            }),
        ];
    },
    name: 'markdownPaste',
});
