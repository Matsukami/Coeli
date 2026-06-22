import type { Control } from 'react-hook-form';

import { GripVertical } from 'lucide-react';

import type { KnowledgeDocumentFragmentFragment } from '@/graphql/types';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

import type { FormValues } from './knowledge-form';

import { KnowledgeContentField, KnowledgeMetaFields } from './knowledge-form-controls';

interface KnowledgeFormLayoutProps {
    control: Control<FormValues>;
    isNew: boolean;
    isSaving: boolean;
    knowledge?: KnowledgeDocumentFragmentFragment | null;
}

interface KnowledgeIntroBlockProps {
    isNew: boolean;
    knowledge?: KnowledgeDocumentFragmentFragment | null;
}

export function KnowledgeFormLayoutDesktop({ control, isNew, isSaving, knowledge }: KnowledgeFormLayoutProps) {
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
                            <CardContent className="flex flex-col gap-6 py-6">
                                <KnowledgeIntroBlock
                                    isNew={isNew}
                                    knowledge={knowledge}
                                />
                                <KnowledgeMetaFields
                                    control={control}
                                    isNew={isNew}
                                    isSaving={isSaving}
                                />
                            </CardContent>
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
                    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
                        <KnowledgeContentField
                            control={control}
                            fillParent
                            isSaving={isSaving}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}

export function KnowledgeFormLayoutMobile({ control, isNew, isSaving, knowledge }: KnowledgeFormLayoutProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <KnowledgeIntroBlock
                isNew={isNew}
                knowledge={knowledge}
            />
            <KnowledgeMetaFields
                control={control}
                isNew={isNew}
                isSaving={isSaving}
            />
            <KnowledgeContentField
                control={control}
                isSaving={isSaving}
                showLabel
            />
        </div>
    );
}

function KnowledgeIntroBlock({ isNew, knowledge }: KnowledgeIntroBlockProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-center">
                <h2 className="text-2xl font-semibold">
                    {isNew ? 'Create a new knowledge document' : 'Edit knowledge document'}
                </h2>
                <p className="text-muted-foreground">
                    {isNew
                        ? 'Add an entry to the vector knowledge base'
                        : 'Edits to content or metadata will trigger re-embedding'}
                </p>
            </div>

            {!isNew && knowledge ? (
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={knowledge.manual ? 'secondary' : 'outline'}>
                        {knowledge.manual ? 'manual' : 'agent'}
                    </Badge>
                    {knowledge.flowId ? <Badge variant="outline">flow #{knowledge.flowId}</Badge> : null}
                    {knowledge.taskId ? <Badge variant="outline">task #{knowledge.taskId}</Badge> : null}
                    {knowledge.subtaskId ? <Badge variant="outline">subtask #{knowledge.subtaskId}</Badge> : null}
                    <span>·</span>
                    <span>
                        chunk {knowledge.partSize} of {knowledge.totalSize}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
