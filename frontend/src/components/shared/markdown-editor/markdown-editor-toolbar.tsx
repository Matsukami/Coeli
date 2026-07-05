import type { Editor } from '@tiptap/react';

import { useEditorState } from '@tiptap/react';
import {
    Bold,
    Code,
    Code2,
    Heading1,
    Heading2,
    Heading3,
    ImagePlus,
    Italic,
    Link as LinkIcon,
    List,
    ListOrdered,
    ListTodo,
    Minus,
    Quote,
    Redo,
    Strikethrough,
    Table,
    Undo,
} from 'lucide-react';
import { memo, useCallback } from 'react';

import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

interface MarkdownEditorToolbarProps {
    disabled?: boolean;
    editor: Editor;
}

// The Image extension doesn't validate the src protocol, so the toolbar Insert-image button rejects
// non-http(s)/non-raster-data URLs (javascript:, data:text/html, data:image/svg+xml — SVG can carry script).
// Guards ONLY that button — images entering via markdown load/paste bypass it (inert in an <img src>; the
// read-only viewer sanitizes protocols on render).
export const isSafeImageSrc = (url: string): boolean => {
    try {
        const { protocol } = new URL(url, window.location.href);

        return (
            protocol === 'http:' || protocol === 'https:' || /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(url)
        );
    } catch {
        return false;
    }
};

// Link-toolbar counterpart of isSafeImageSrc: only navigable protocols (relative/anchor URLs resolve to the
// page's http/https). Keeps `javascript:` / `data:` out of the persisted document at authoring time so it
// never depends on every future render path sanitizing them. Load/paste bypass this (tiptap Link's
// isAllowedUri + the read-only viewer sanitize protocols on render).
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export const isSafeUrl = (url: string): boolean => {
    try {
        return SAFE_LINK_PROTOCOLS.has(new URL(url, window.location.href).protocol);
    } catch {
        return false;
    }
};

// memo: every keystroke re-renders the RHF-controlled parent; without it all ~20 Toggle subtrees re-render
// per keystroke for referentially-stable props.
export const MarkdownEditorToolbar = memo(function MarkdownEditorToolbar({
    disabled,
    editor,
}: MarkdownEditorToolbarProps) {
    const handleSetLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('URL', previousUrl ?? '');

        if (url === null) {
            return;
        }

        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();

            return;
        }

        if (!isSafeUrl(url)) {
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    // tiptap v3's useEditor does NOT re-render on every transaction, so reading editor.isActive/can() inline
    // would leave the toolbar stale on selection-only moves (click into a bold word → Bold stays unlit).
    // useEditorState re-runs this selector per transaction and re-renders only when a button's state flips.
    const state = useEditorState({
        editor,
        selector: ({ editor }) => ({
            canRedo: editor.can().redo(),
            canUndo: editor.can().undo(),
            isBlockquote: editor.isActive('blockquote'),
            isBold: editor.isActive('bold'),
            isBulletList: editor.isActive('bulletList'),
            isCode: editor.isActive('code'),
            isCodeBlock: editor.isActive('codeBlock'),
            isH1: editor.isActive('heading', { level: 1 }),
            isH2: editor.isActive('heading', { level: 2 }),
            isH3: editor.isActive('heading', { level: 3 }),
            isItalic: editor.isActive('italic'),
            isLink: editor.isActive('link'),
            isOrderedList: editor.isActive('orderedList'),
            isStrike: editor.isActive('strike'),
            isTable: editor.isActive('table'),
            isTaskList: editor.isActive('taskList'),
        }),
    });

    return (
        <div
            className={cn(
                'bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1 py-1',
                disabled && 'pointer-events-none opacity-60',
            )}
            data-slot="markdown-editor-toolbar"
        >
            <Toggle
                aria-label="Bold"
                onPressedChange={() => editor.chain().focus().toggleBold().run()}
                pressed={state.isBold}
                size="sm"
                title="Bold (Ctrl+B)"
            >
                <Bold />
            </Toggle>
            <Toggle
                aria-label="Italic"
                onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                pressed={state.isItalic}
                size="sm"
                title="Italic (Ctrl+I)"
            >
                <Italic />
            </Toggle>
            <Toggle
                aria-label="Strikethrough"
                onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                pressed={state.isStrike}
                size="sm"
                title="Strikethrough"
            >
                <Strikethrough />
            </Toggle>
            <Toggle
                aria-label="Inline code"
                onPressedChange={() => editor.chain().focus().toggleCode().run()}
                pressed={state.isCode}
                size="sm"
                title="Inline code"
            >
                <Code />
            </Toggle>

            <Separator
                className="mx-1 h-5"
                orientation="vertical"
            />

            <Toggle
                aria-label="Heading 1"
                onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                pressed={state.isH1}
                size="sm"
                title="Heading 1"
            >
                <Heading1 />
            </Toggle>
            <Toggle
                aria-label="Heading 2"
                onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                pressed={state.isH2}
                size="sm"
                title="Heading 2"
            >
                <Heading2 />
            </Toggle>
            <Toggle
                aria-label="Heading 3"
                onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                pressed={state.isH3}
                size="sm"
                title="Heading 3"
            >
                <Heading3 />
            </Toggle>

            <Separator
                className="mx-1 h-5"
                orientation="vertical"
            />

            <Toggle
                aria-label="Bullet list"
                onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                pressed={state.isBulletList}
                size="sm"
                title="Bullet list"
            >
                <List />
            </Toggle>
            <Toggle
                aria-label="Ordered list"
                onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                pressed={state.isOrderedList}
                size="sm"
                title="Ordered list"
            >
                <ListOrdered />
            </Toggle>
            <Toggle
                aria-label="Task list"
                onPressedChange={() => editor.chain().focus().toggleTaskList().run()}
                pressed={state.isTaskList}
                size="sm"
                title="Task list"
            >
                <ListTodo />
            </Toggle>

            <Separator
                className="mx-1 h-5"
                orientation="vertical"
            />

            <Toggle
                aria-label="Blockquote"
                onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
                pressed={state.isBlockquote}
                size="sm"
                title="Blockquote"
            >
                <Quote />
            </Toggle>
            <Toggle
                aria-label="Code block"
                onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
                pressed={state.isCodeBlock}
                size="sm"
                title="Code block"
            >
                <Code2 />
            </Toggle>
            <Toggle
                aria-label="Link"
                onPressedChange={handleSetLink}
                pressed={state.isLink}
                size="sm"
                title="Insert link"
            >
                <LinkIcon />
            </Toggle>
            <Toggle
                aria-label="Insert image"
                onPressedChange={() => {
                    const url = window.prompt('Image URL');

                    if (url && isSafeImageSrc(url)) {
                        editor.chain().focus().setImage({ src: url }).run();
                    }
                }}
                pressed={false}
                size="sm"
                title="Insert image"
            >
                <ImagePlus />
            </Toggle>
            <Toggle
                aria-label="Horizontal rule"
                onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
                pressed={false}
                size="sm"
                title="Horizontal rule"
            >
                <Minus />
            </Toggle>
            <Toggle
                aria-label="Insert table"
                onPressedChange={() =>
                    editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run()
                }
                pressed={state.isTable}
                size="sm"
                title="Insert table"
            >
                <Table />
            </Toggle>

            <div className="ml-auto flex items-center gap-0.5">
                <Toggle
                    aria-label="Undo"
                    disabled={!state.canUndo}
                    onPressedChange={() => editor.chain().focus().undo().run()}
                    pressed={false}
                    size="sm"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo />
                </Toggle>
                <Toggle
                    aria-label="Redo"
                    disabled={!state.canRedo}
                    onPressedChange={() => editor.chain().focus().redo().run()}
                    pressed={false}
                    size="sm"
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <Redo />
                </Toggle>
            </div>
        </div>
    );
});
