import type { ReactNode } from 'react';

import { GripVertical } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

interface DetailTwoPanelLayoutProps {
    left: ReactNode;
    right: ReactNode;
    rightClassName?: string;
}

export function DetailTwoPanelLayout({
    left,
    right,
    rightClassName = 'flex h-full min-h-0 flex-col overflow-y-auto p-4',
}: DetailTwoPanelLayoutProps) {
    return (
        <div className="flex min-h-0 w-full max-w-full flex-1 overflow-hidden">
            <ResizablePanelGroup
                className="w-full"
                orientation="horizontal"
            >
                <ResizablePanel
                    defaultSize={45}
                    minSize={30}
                >
                    <div className="h-full min-h-0 overflow-y-auto">
                        <Card className="mx-auto min-h-full w-full max-w-2xl rounded-none border-0">
                            <CardContent className="flex flex-col gap-6 py-6">{left}</CardContent>
                        </Card>
                    </div>
                </ResizablePanel>
                <ResizableHandle withHandle>
                    <GripVertical className="size-4" />
                </ResizableHandle>
                <ResizablePanel
                    defaultSize={55}
                    minSize={30}
                >
                    <div className={rightClassName}>{right}</div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
