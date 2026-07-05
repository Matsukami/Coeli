import type { Editor } from '@tiptap/react';
import type { AriaAttributes, Ref } from 'react';

import { history } from '@tiptap/pm/history';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { Loader2 } from 'lucide-react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { createMarkdownExtensions } from './markdown-editor-extensions';
import { MARKDOWN_EDITOR_WRAPPER_CLASS as WRAPPER_CLASS } from './markdown-editor-styles';
import { MarkdownEditorToolbar } from './markdown-editor-toolbar';
import { findVariableOccurrences } from './markdown-editor-variable-highlight';
import { nextVariableRange } from './markdown-editor-variable-syntax';

export interface MarkdownEditorHandle {
    cycleToVariable: (variable: string) => boolean;
    focus: () => void;
    insertAtCursor: (text: string) => void;
}

interface MarkdownEditorProps {
    'aria-describedby'?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    className?: string;
    disabled?: boolean;
    id?: string;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
}

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

function MarkdownEditor({
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    className,
    disabled,
    id,
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

    // Captured at mount: tiptap only reads `content` at construction, and the value-sync effect below owns
    // every later update. Passing `value` reactively would make useEditor's compareOptions see content change
    // on each keystroke and fire a redundant setOptions → view.updateState.
    const [initialContent] = useState(() => value);

    // `placeholder` is captured at mount, like the native <input placeholder>. tiptap's setOptions merges
    // options without re-registering extensions, so a later change can't reach the already-built Placeholder
    // plugin regardless; keeping it out of the deps makes that explicit and stops rebuilding the whole
    // extension array on every placeholder change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const extensions = useMemo(() => createMarkdownExtensions(placeholder), []);

    // tiptap invokes onBlur/onUpdate from its live options ref, so these closures always read the latest props.
    const editor = useEditor({
        content: initialContent,
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
                const hits = findVariableOccurrences(state.doc, variable).map(({ from, to }) => ({
                    end: to,
                    start: from,
                }));
                const { from, to } = state.selection;
                const target = nextVariableRange(hits, from, to);

                if (!target) {
                    return false;
                }

                // Focus first: ProseMirror won't scrollIntoView an unfocused editor (first post-load click would no-op).
                view.focus();
                view.dispatch(
                    state.tr.setSelection(TextSelection.create(state.doc, target.start, target.end)).scrollIntoView(),
                );

                return true;
            },
            focus: () => {
                editor?.commands.focus();
            },
            insertAtCursor: (text: string) => {
                if (!editor) {
                    return;
                }

                const { state, view } = editor;

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

        // On mount the construction-time parse already reflects `initialContent`, so compare against THAT, not
        // getMarkdown(): serialization normalizes most real documents, so `getMarkdown() !== value` on mount
        // would re-parse the identical doc — doubling mount cost for exactly the large documents where parse
        // dominates. After mount, getMarkdown() is the right divergence check for external form.reset syncs.
        const isExternalChange = hasResetInitialHistoryRef.current
            ? editor.getMarkdown() !== value
            : value !== initialContent;

        if (isExternalChange) {
            editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
        }

        // Seed with the editor's serialized markdown, not the raw `value` — else the first user keystroke
        // would re-emit the round-trip normalization as if it were an edit.
        lastEmittedRef.current = editor.getMarkdown();

        // Clear the undo stack:
        //   - on initial mount, to discard the construction-time
        //     transactions dispatched by extensions like `trailingNode`;
        //   - on every external `setContent` (e.g. parent calls
        //     form.reset(serverDocument)), because that transaction is
        //     not a user edit either.
        if (!hasResetInitialHistoryRef.current || isExternalChange) {
            hasResetInitialHistoryRef.current = true;
            resetUndoHistory(editor);
        }
    }, [editor, value, initialContent]);

    useEffect(() => {
        if (!editor || editor.isEditable === !disabled) {
            return;
        }

        editor.setEditable(!disabled);
    }, [editor, disabled]);

    // FormControl (Radix Slot) injects these; forward them to the ProseMirror contenteditable. NOT via
    // reactive editorProps: setOptions(editorProps) wholesale-replaces `attributes` (dropping tiptap's
    // default role="textbox") and diffs by object identity. PM only removes attributes it set itself, so
    // writing ours directly on view.dom survives its updates.
    useEffect(() => {
        if (!editor) {
            return;
        }

        const { dom } = editor.view;

        for (const [name, attribute] of Object.entries({
            'aria-describedby': ariaDescribedby,
            'aria-invalid': ariaInvalid,
            id,
        })) {
            if (attribute === undefined) {
                dom.removeAttribute(name);
            } else {
                dom.setAttribute(name, String(attribute));
            }
        }
    }, [editor, ariaDescribedby, ariaInvalid, id]);

    if (!editor) {
        return (
            <div
                aria-busy="true"
                className={cn(
                    WRAPPER_CLASS,
                    'items-center justify-center',
                    disabled && 'pointer-events-none opacity-60',
                    className,
                )}
                data-slot="markdown-editor"
            >
                <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
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
            <MarkdownEditorToolbar
                disabled={disabled}
                editor={editor}
            />
            <EditorContent
                className={cn(
                    'prose prose-sm dark:prose-invert tiptap-content max-w-none min-w-0 flex-1 overflow-auto px-3 py-2',
                    '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none',
                )}
                editor={editor}
            />
        </div>
    );
}

export { MarkdownEditor };
