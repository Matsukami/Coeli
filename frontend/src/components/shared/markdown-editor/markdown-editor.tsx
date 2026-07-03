import type { Editor } from '@tiptap/react';

import { history } from '@tiptap/pm/history';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
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
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

import { createMarkdownExtensions } from './markdown-editor-extensions';
import { findVariableOccurrences } from './markdown-editor-variable-highlight';

export interface MarkdownEditorHandle {
    cycleToVariable: (variable: string) => boolean;
    insertAtCursor: (text: string) => void;
}

interface MarkdownEditorProps {
    autoFocus?: boolean;
    className?: string;
    contentClassName?: string;
    disabled?: boolean;
    hasToolbar?: boolean;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
}

// Clears the undo/redo stack by swapping the history plugin for a fresh instance. MUST NOT run on user
// edits (value changes carry user input too) — that would wipe the user's own Ctrl+Z history.
export const resetUndoHistory = (editor: Editor): void => {
    const { state, view } = editor;
    // A fresh history() shares prosemirror-history's module-level singleton PluginKey, so match the
    // existing plugin by key identity rather than sniffing the stringified key name.
    const replacement = history();
    const historyIndex = state.plugins.findIndex((plugin) => plugin.spec.key === replacement.spec.key);

    if (historyIndex < 0) {
        return;
    }

    const plugins = [...state.plugins];

    plugins[historyIndex] = replacement;

    // Rebuild via `EditorState.create`, NOT `state.reconfigure({ plugins })`: reconfigure sees the shared
    // history key in both plugin arrays, treats it as the same plugin, and KEEPS the old undo state — so
    // the stack would stay populated despite the swap. EditorState.create initializes every plugin fresh.
    const newState = EditorState.create({
        doc: state.doc,
        plugins,
        schema: state.schema,
        selection: state.selection,
        storedMarks: state.storedMarks,
    });

    view.updateState(newState);

    // `view.updateState` bypasses PM's dispatch pipeline, so tiptap's `transaction` subscription doesn't fire
    // and the toolbar keeps showing a stale `canUndo: true`. Dispatch an empty transaction to wake it — built
    // from the LIVE `view.state`, not `newState`: updateState can synchronously advance the view (a plugin
    // view or tiptap's deferred initial-content transaction dispatching during reconfigure), and a tr whose
    // `before` doc no longer matches `view.state.doc` throws "Applying a mismatched transaction".
    view.dispatch(view.state.tr.setMeta('addToHistory', false));
};

interface MarkdownEditorToolbarProps {
    disabled?: boolean;
    editor: Editor;
}

// Shared by the loading shell and the mounted editor so the two wrappers cannot drift.
const WRAPPER_CLASS =
    'border-input dark:bg-input/30 group/markdown-editor flex w-full flex-col overflow-hidden rounded-md border shadow-2xs outline-hidden transition-[color,box-shadow]';

function MarkdownEditor({
    autoFocus,
    className,
    contentClassName,
    disabled,
    hasToolbar = true,
    onBlur,
    onChange,
    placeholder = 'Write something…',
    ref,
    value,
}: MarkdownEditorProps & { ref?: Ref<MarkdownEditorHandle> }) {
    // Suppress echoes of our own output: the markdown round-trip re-serializes slightly (whitespace/list
    // markers/blank lines), and those normalizations must not flip RHF's isDirty as if the user had edited.
    const lastEmittedRef = useRef<string>(value);

    // Ignore the onUpdate echoes tiptap fires for the initial parse during view construction — forwarding
    // them would dirty the form on mount; start forwarding only after onCreate sets the baseline.
    const isInitializedRef = useRef(false);

    const hasResetInitialHistoryRef = useRef(false);

    // `placeholder` is captured at mount, like the native <input placeholder>. tiptap's setOptions merges
    // options without re-registering extensions, so a later change can't reach the already-built Placeholder
    // plugin regardless; keeping it out of the deps makes that explicit and stops rebuilding the whole
    // extension array on every placeholder change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const extensions = useMemo(() => createMarkdownExtensions(placeholder), []);

    // tiptap invokes onBlur/onUpdate from its live options ref, so these closures always read the latest props.
    const editor = useEditor({
        content: value,
        contentType: 'markdown',
        editable: !disabled,
        extensions,
        immediatelyRender: false,
        onBlur: () => onBlur?.(),
        onCreate: ({ editor: instance }) => {
            lastEmittedRef.current = instance.getMarkdown();
            isInitializedRef.current = true;
        },
        onUpdate: ({ editor: instance }) => {
            if (!isInitializedRef.current) {
                return;
            }

            const next = instance.getMarkdown();

            if (next === lastEmittedRef.current) {
                return;
            }

            lastEmittedRef.current = next;
            onChange(next);
        },
    });

    useImperativeHandle(
        ref,
        () => ({
            cycleToVariable: (variable: string) => {
                if (!editor) {
                    return false;
                }

                const { state, view } = editor;
                const hits = findVariableOccurrences(state.doc, variable);

                if (hits.length === 0) {
                    return false;
                }

                const { from, to } = state.selection;
                const currentIndex = hits.findIndex((hit) => hit.from === from && hit.to === to);
                const target =
                    currentIndex >= 0
                        ? hits[(currentIndex + 1) % hits.length]
                        : (hits.find((hit) => hit.from >= from) ?? hits[0]);

                if (!target) {
                    return false;
                }

                // Focus first: ProseMirror won't scrollIntoView an unfocused editor (first post-load click would no-op).
                view.focus();
                view.dispatch(
                    state.tr.setSelection(TextSelection.create(state.doc, target.from, target.to)).scrollIntoView(),
                );

                return true;
            },
            insertAtCursor: (text: string) => {
                if (!editor) {
                    return;
                }

                const { state, view } = editor;

                // Focus before scroll — PM won't scrollIntoView an unfocused view (same as cycleToVariable).
                view.focus();
                view.dispatch(state.tr.insertText(text).scrollIntoView());
            },
        }),
        [editor],
    );

    useEffect(() => {
        if (!editor) {
            return;
        }

        // Skip when `value` is just our own echoed onUpdate output — the editor already reflects it, so the
        // getMarkdown re-serialization below would no-op. Mount (hasResetInitialHistoryRef) and real external
        // changes (form.reset, where value ≠ lastEmittedRef) still fall through and sync.
        if (hasResetInitialHistoryRef.current && value === lastEmittedRef.current) {
            return;
        }

        const current = editor.getMarkdown();
        const shouldExternalSync = current !== value;

        if (shouldExternalSync) {
            // emitUpdate:false — an external sync (form.reset) is not a user edit, so it must not fire onChange.
            editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
        }

        // Seed with the editor's serialized markdown, not the raw `value` — else the first user keystroke
        // would re-emit the round-trip normalization as if it were an edit.
        lastEmittedRef.current = editor.getMarkdown();

        // Clear the undo stack:
        //   - on initial mount, to discard the construction-time
        //     transactions dispatched by extensions like `trailingNode`
        //     plus the initial `setContent` we just ran above;
        //   - on every external `setContent` (e.g. parent calls
        //     form.reset(serverDocument)), because that transaction is
        //     not a user edit either.
        if (!hasResetInitialHistoryRef.current || shouldExternalSync) {
            hasResetInitialHistoryRef.current = true;
            resetUndoHistory(editor);
        }
    }, [editor, value]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        editor.setEditable(!disabled);
    }, [editor, disabled]);

    useEffect(() => {
        if (autoFocus && editor) {
            editor.commands.focus('end');
        }
        // `autoFocus` is intentionally omitted from the deps — it's a
        // mount-time prop, equivalent to the native `<input autoFocus>`
        // attribute. We don't want a parent flipping `autoFocus` later
        // to steal focus back into the editor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);

    if (!editor) {
        return (
            <div
                aria-busy="true"
                className={cn(WRAPPER_CLASS, disabled && 'pointer-events-none opacity-60', className)}
                data-slot="markdown-editor"
            />
        );
    }

    return (
        <div
            className={cn(
                WRAPPER_CLASS,
                'focus-within:ring-ring focus-within:ring-1',
                disabled && 'pointer-events-none opacity-60',
                className,
            )}
            data-slot="markdown-editor"
        >
            {hasToolbar ? (
                <MarkdownEditorToolbar
                    disabled={disabled}
                    editor={editor}
                />
            ) : null}
            <EditorContent
                className={cn(
                    'prose prose-sm dark:prose-invert tiptap-content max-w-none min-w-0 flex-1 overflow-auto px-3 py-2',
                    '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none',
                    contentClassName,
                )}
                editor={editor}
            />
        </div>
    );
}

// The Image extension doesn't validate the src protocol, so the toolbar Insert-image button rejects
// non-http(s)/non-image-data URLs (javascript:, data:text/html, …). Guards ONLY that button — images entering
// via markdown load/paste bypass it (inert in an <img src>; the read-only viewer sanitizes protocols on render).
export const isSafeImageSrc = (url: string): boolean => {
    try {
        const { protocol } = new URL(url, window.location.href);

        return protocol === 'http:' || protocol === 'https:' || /^data:image\//i.test(url);
    } catch {
        return false;
    }
};

function MarkdownEditorToolbar({ disabled, editor }: MarkdownEditorToolbarProps) {
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
}

export { MarkdownEditor };
