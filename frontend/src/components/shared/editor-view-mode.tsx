import { Code, Eye } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 'rich' reflows whitespace on save (tiptap); 'raw' is a byte-exact textarea over the source.
export type EditorViewMode = 'raw' | 'rich';

interface EditorViewModeToggleProps {
    className?: string;
    mode: EditorViewMode;
    onModeChange: (mode: EditorViewMode) => void;
    rawTooltip?: string;
}

export function EditorViewModeToggle({ className, mode, onModeChange, rawTooltip }: EditorViewModeToggleProps) {
    return (
        <Tabs
            className={className}
            onValueChange={(value) => onModeChange(value as EditorViewMode)}
            value={mode}
        >
            <TabsList className="h-7 p-0.5">
                <TabsTrigger
                    aria-label="Rich editor"
                    className="h-6 px-2"
                    value="rich"
                >
                    <Eye className="size-4" />
                </TabsTrigger>
                <TabsTrigger
                    aria-label="Raw source"
                    className="h-6 px-2"
                    title={rawTooltip}
                    value="raw"
                >
                    <Code className="size-4" />
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}
