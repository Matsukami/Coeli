import type { AriaAttributes, ReactNode, Ref } from 'react';

import { Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { MarkdownEditorHandle } from './markdown-editor';
import type { EditorViewMode } from './markdown-editor-view-mode';

// Static-importing MarkdownEditor would merge the tiptap chunk into every route that pulls a util from the
// barrel; the lazy() boundary is what lets the barrel re-export this component eagerly.
const MarkdownEditor = lazy(() => import('./markdown-editor').then((module) => ({ default: module.MarkdownEditor })));

interface MarkdownEditorFieldProps extends Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid'> {
    // Sizes the field's outer box in both modes — the rich editor wrapper and the raw <textarea> take the
    // same flex/min-height layout. The byte-exact font-mono / no-resize raw config is baked in, not overridable.
    className?: string;
    disabled?: boolean;
    fallback?: ReactNode;
    id?: string;
    mode: EditorViewMode;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder?: string;
    ref?: Ref<MarkdownEditorHandle>;
    value: string;
}

export function MarkdownEditorField({
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    className,
    disabled,
    fallback,
    id,
    mode,
    onBlur,
    onChange,
    placeholder,
    ref,
    value,
}: MarkdownEditorFieldProps) {
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
                value={value}
            />
        );
    }

    return (
        <Suspense
            fallback={
                fallback ?? (
                    <div className={cn('flex items-center justify-center rounded-md border', className)}>
                        <Loader2 className="text-muted-foreground size-5 animate-spin" />
                    </div>
                )
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
                ref={ref}
                value={value}
            />
        </Suspense>
    );
}
