// Shell classes for the editor box. Kept in this tiny leaf module (no tiptap import) so MarkdownEditorField's
// lazy-load fallback can wear the same box as the mounted editor without pulling the tiptap chunk eagerly.
export const MARKDOWN_EDITOR_WRAPPER_CLASS =
    'border-input dark:bg-input/30 group/markdown-editor flex w-full flex-col overflow-hidden rounded-md border shadow-2xs outline-hidden transition-[color,box-shadow]';
