import type { AriaAttributes, Ref } from 'react';

import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useImperativeHandle, useRef } from 'react';

import type { TextareaRef } from '@/components/ui/textarea';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { MarkdownEditorHandle } from './markdown-editor';
import type { EditorViewMode } from './markdown-editor-view-mode';

// Static-importing MarkdownEditor would merge the tiptap chunk into every route that pulls a util from the
// barrel; the lazy() boundary is what lets the barrel re-export this component eagerly.
const MarkdownEditor = lazy(() => import('./markdown-editor').then((module) => ({ default: module.MarkdownEditor })));

// The imperative handle a consumer gets via `ref`. `focus()` is honored in BOTH modes (so RHF's
// focus-on-validation-error reaches the field whether it renders a textarea or the rich editor). The
// variable-panel methods exist only in rich mode — raw has no ProseMirror doc to cycle — so they are optional.
export interface MarkdownEditorFieldHandle {
    cycleToVariable?: (variable: string) => boolean;
    focus: () => void;
    insertAtCursor?: (text: string) => void;
}

interface MarkdownEditorFieldProps extends Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid'> {
    // Sizes the field's outer box in both modes — the rich editor wrapper and the raw <textarea> take the
    // same flex/min-height layout. The byte-exact font-mono / no-resize raw config is baked in, not overridable.
    className?: string;
    disabled?: boolean;
    id?: string;
    mode: EditorViewMode;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder?: string;
    ref?: Ref<MarkdownEditorFieldHandle>;
    value: string;
}

export function MarkdownEditorField({
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    className,
    disabled,
    id,
    mode,
    onBlur,
    onChange,
    placeholder,
    ref,
    value,
}: MarkdownEditorFieldProps) {
    const rawRef = useRef<TextareaRef>(null);
    const richRef = useRef<MarkdownEditorHandle>(null);

    useImperativeHandle(
        ref,
        () =>
            mode === 'raw'
                ? { focus: () => rawRef.current?.focus() }
                : {
                      cycleToVariable: (variable) => richRef.current?.cycleToVariable(variable) ?? false,
                      focus: () => richRef.current?.focus(),
                      insertAtCursor: (text) => richRef.current?.insertAtCursor(text),
                  },
        [mode],
    );

    if (mode === 'raw') {
        return (
            <Textarea
                aria-describedby={ariaDescribedby}
                aria-invalid={ariaInvalid}
                autoSize={false}
                className={cn('resize-none font-mono text-sm', className)}
                disabled={disabled}
                id={id}
                onBlur={onBlur}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                ref={rawRef}
                value={value}
            />
        );
    }

    return (
        <Suspense
            fallback={
                <div
                    aria-busy="true"
                    className={cn('flex items-center justify-center rounded-md border', className)}
                >
                    <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
            }
        >
            <MarkdownEditor
                aria-describedby={ariaDescribedby}
                aria-invalid={ariaInvalid}
                className={className}
                disabled={disabled}
                id={id}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={placeholder}
                ref={richRef}
                value={value}
            />
        </Suspense>
    );
}
