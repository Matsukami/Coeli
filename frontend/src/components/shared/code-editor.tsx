import { markdown } from '@codemirror/lang-markdown';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { type Ref, useMemo } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export type { ReactCodeMirrorRef };

export interface CodeEditorProps {
    className?: string;
    disabled?: boolean;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder?: string;
    ref?: Ref<ReactCodeMirrorRef>;
    value: string;
}

const extensions = [markdown(), EditorView.lineWrapping];

/**
 * Byte-faithful text editor: CodeMirror edits the raw document string verbatim, with no
 * parse/serialize round-trip. Don't swap in a markdown/rich editor — it would corrupt
 * Go-template tables, `<tags>`, and significant whitespace on round-trip.
 */
export function CodeEditor({ className, disabled, onBlur, onChange, placeholder, ref, value }: CodeEditorProps) {
    const { theme } = useTheme();
    const isDark = useMemo(
        () => theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
        [theme],
    );

    return (
        <CodeMirror
            className={cn(
                'border-input dark:bg-input/30 focus-within:ring-ring h-full overflow-hidden rounded-md border text-sm shadow-2xs focus-within:ring-1',
                disabled && 'pointer-events-none opacity-60',
                className,
            )}
            editable={!disabled}
            extensions={extensions}
            height="100%"
            onBlur={onBlur}
            onChange={onChange}
            placeholder={placeholder}
            ref={ref}
            theme={isDark ? 'dark' : 'light'}
            value={value}
        />
    );
}
