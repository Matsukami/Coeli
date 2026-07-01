import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import { createMarkdownLayer, MarkdownTable } from './editor-markdown';
import { MarkdownPaste } from './editor-paste';
import { TagHighlight } from './editor-tag-highlight';
import { VariableHighlight } from './editor-variable-highlight';

// Single source of truth for the editor's extension stack — shared by markdown-editor.tsx AND the
// round-trip tests so they can never drift. createMarkdownLayer is the official @tiptap/markdown layer
// tuned for our content (see editor-markdown.ts); VariableHighlight/TagHighlight are view-only decorations
// ({{vars}} / <tags>) that don't affect serialization.
export const createMarkdownExtensions = (placeholder?: string) => [
    StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'hljs' } } }),
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
