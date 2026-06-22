import { useMutation, useQuery } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    AlertCircle,
    Bot,
    CheckCircle,
    Code,
    Ellipsis,
    FileDiff,
    FileText,
    GripVertical,
    Loader2,
    RotateCcw,
    Save,
    User,
    Wrench,
    XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import {
    type Control,
    type FieldPathByValue,
    type FieldValues,
    useController,
    useForm,
    useFormState,
} from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import type {
    DefaultPromptFragmentFragment as DefaultPrompt,
    PromptType,
    ValidatePromptMutation,
} from '@/graphql/types';

type AgentPrompt = AgentPrompts;
type AgentPrompts = { human?: DefaultPrompt; system: DefaultPrompt };

import {
    AppHeader,
    AppHeaderAction,
    AppHeaderActions,
    AppHeaderContent,
    AppHeaderTitle,
} from '@/components/layouts/app/app-header';
import ConfirmationDialog from '@/components/shared/confirmation-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { StatusCard } from '@/components/ui/status-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    CreatePromptDocument,
    DeletePromptDocument,
    SettingsPromptsDocument,
    UpdatePromptDocument,
    ValidatePromptDocument,
} from '@/graphql/types';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { formatPromptId } from '@/lib/route-titles/format-prompt-id';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

const systemFormSchema = z.object({
    template: z.string().min(1, 'System template is required'),
});

const humanFormSchema = z.object({
    template: z.string().min(1, 'Human template is required'),
});

interface BaseFieldProps<T extends FieldValues> extends ControllerProps<T> {
    label?: string;
}
interface BaseTextareaProps {
    className?: string;
    placeholder?: string;
}

interface ControllerProps<T extends FieldValues> {
    control: Control<T>;
    disabled?: boolean;
    name: FieldPathByValue<T, string>;
}

interface FormTextareaItemProps<T extends FieldValues> extends BaseFieldProps<T>, BaseTextareaProps {
    description?: string;
}

type HumanFormData = z.infer<typeof humanFormSchema>;

type SystemFormData = z.infer<typeof systemFormSchema>;

function FormTextareaItem<T extends FieldValues>({
    className,
    control,
    disabled,
    label,
    name,
    placeholder,
}: FormTextareaItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        disabled,
        name,
    });

    return (
        <FormItem className="flex min-h-0 flex-1 flex-col">
            {label && <FormLabel>{label}</FormLabel>}
            <FormControl>
                <Textarea
                    {...field}
                    autoSize={false}
                    className={cn('min-h-[640px] flex-1 resize-none font-mono text-sm', className)}
                    disabled={disabled}
                    placeholder={placeholder}
                />
            </FormControl>
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

const getUsedVariables = (template: string | undefined): Set<string> => {
    const usedVariables = new Set<string>();

    if (!template) {
        return usedVariables;
    }

    const variableRegex = /\{\{\.(\w+)\}\}/g;
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
        const variable = match[1];

        if (variable) {
            usedVariables.add(variable);
        }
    }

    return usedVariables;
};

interface VariablesProps {
    currentTemplate: string;
    onVariableClick: (variable: string) => void;
    variables: string[];
}

function SettingsPrompt() {
    const { promptId } = useParams<{ promptId: string }>();
    const navigate = useNavigate();
    const { isDesktop } = useBreakpoint();

    const { data, error, loading } = useQuery(SettingsPromptsDocument);
    const [createPrompt, { loading: isCreateLoading }] = useMutation(CreatePromptDocument);
    const [updatePrompt, { loading: isUpdateLoading }] = useMutation(UpdatePromptDocument);
    const [deletePrompt, { loading: isDeleteLoading }] = useMutation(DeletePromptDocument);
    const [validatePrompt, { loading: isValidateLoading }] = useMutation(ValidatePromptDocument);

    const [submitError, setSubmitError] = useState<null | string>(null);
    const [activeTab, setActiveTab] = useState<'human' | 'system'>('system');
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [validationResult, setValidationResult] = useState<null | ValidatePromptMutation['validatePrompt']>(null);
    const [validationDialogOpen, setValidationDialogOpen] = useState(false);
    const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [pendingBrowserBack, setPendingBrowserBack] = useState(false);
    const allowBrowserLeaveRef = useRef(false);
    const hasPushedBlockerStateRef = useRef(false);

    const isLoading = isCreateLoading || isUpdateLoading || isDeleteLoading || isValidateLoading;

    const handleVariableClick = (
        variable: string,
        field: { onChange: (value: string) => void; value: string },
        formId: string,
    ) => {
        const textarea = document.querySelector(`#${formId} textarea`) as HTMLTextAreaElement;

        if (textarea) {
            const currentValue = field.value || '';
            const variablePattern = `{{.${variable}}}`;

            const variableIndex = currentValue.indexOf(variablePattern);

            if (variableIndex !== -1) {
                textarea.focus();
                textarea.setSelectionRange(variableIndex, variableIndex + variablePattern.length);

                const lineHeight = 20;
                const textBeforeSelection = currentValue.slice(0, Math.max(0, variableIndex));
                const linesBeforeSelection = textBeforeSelection.split('\n').length - 1;
                const selectionTop = linesBeforeSelection * lineHeight;
                const textareaHeight = textarea.clientHeight;
                const scrollTop = Math.max(0, selectionTop - textareaHeight / 2);

                textarea.scrollTop = scrollTop;
            } else {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const newValue =
                    currentValue.slice(0, Math.max(0, start)) + variablePattern + currentValue.slice(Math.max(0, end));
                field.onChange(newValue);

                // preventScroll: avoid yanking the user away from where they were typing.
                setTimeout(() => {
                    textarea.focus({ preventScroll: true });
                    textarea.setSelectionRange(start + variablePattern.length, start + variablePattern.length);
                }, 0);
            }
        }
    };

    const handleReset = () => {
        setResetDialogOpen(true);
    };

    const handleConfirmReset = async () => {
        if (!promptInfo) {
            return;
        }

        try {
            setSubmitError(null);

            if (activeTab === 'system' && promptInfo.userSystemPrompt) {
                await deletePrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: { promptId: promptInfo.userSystemPrompt.id },
                });
                systemForm.setValue('template', promptInfo.defaultSystemTemplate);
            } else if (activeTab === 'human' && promptInfo.userHumanPrompt) {
                await deletePrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: { promptId: promptInfo.userHumanPrompt.id },
                });
                humanForm.setValue('template', promptInfo.defaultHumanTemplate);
            }

            setResetDialogOpen(false);
        } catch (error) {
            console.error('Reset error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while resetting');
            setResetDialogOpen(false);
        }
    };

    const handleValidate = async () => {
        if (!promptInfo) {
            return;
        }

        try {
            setSubmitError(null);
            setValidationResult(null);

            let promptType: PromptType;
            let currentTemplate: string;

            if (activeTab === 'system') {
                if (promptInfo.type === 'agent') {
                    const agentData = promptInfo.data as AgentPrompt | AgentPrompts;
                    promptType = agentData.system.type;
                } else {
                    const toolData = promptInfo.data as DefaultPrompt;
                    promptType = toolData.type;
                }

                currentTemplate = systemTemplate;
            } else {
                const agentData = promptInfo.data as AgentPrompts;
                promptType = agentData.human!.type;
                currentTemplate = humanTemplate;
            }

            const result = await validatePrompt({
                variables: {
                    template: currentTemplate,
                    type: promptType,
                },
            });

            setValidationResult(result.data?.validatePrompt ?? null);
            setValidationDialogOpen(true);
        } catch (error) {
            console.error('Validation error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while validating');
        }
    };

    const systemForm = useForm<SystemFormData>({
        defaultValues: {
            template: '',
        },
        resolver: zodResolver(systemFormSchema),
    });

    const humanForm = useForm<HumanFormData>({
        defaultValues: {
            template: '',
        },
        resolver: zodResolver(humanFormSchema),
    });

    const { isDirty: isSystemDirty } = useFormState({ control: systemForm.control });
    const { isDirty: isHumanDirty } = useFormState({ control: humanForm.control });
    const isDirty = isSystemDirty || isHumanDirty;

    const systemTemplate = systemForm.watch('template');
    const humanTemplate = humanForm.watch('template');

    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- branching reads from data.settingsPrompts that the compiler can't statically prove stable
    const promptInfo = useMemo(() => {
        if (!promptId || !data?.settingsPrompts) {
            return null;
        }

        const { default: defaultPrompts, userDefined } = data.settingsPrompts;

        if (!defaultPrompts) {
            return null;
        }

        const { agents, tools } = defaultPrompts;

        const agentData = agents?.[promptId as keyof typeof agents] as AgentPrompt | AgentPrompts | undefined;

        if (agentData) {
            const userSystemPrompt = userDefined?.find((p) => p.type === agentData.system.type);
            const userHumanPrompt = userDefined?.find((p) => p.type === (agentData as AgentPrompts)?.human?.type);

            return {
                data: agentData,
                defaultHumanTemplate: (agentData as AgentPrompts)?.human?.template || '',
                defaultSystemTemplate: agentData?.system?.template || '',
                displayName: formatPromptId(promptId),
                hasHuman: !!(agentData as AgentPrompts)?.human,
                humanTemplate: userHumanPrompt?.template || (agentData as AgentPrompts)?.human?.template || '',
                systemTemplate: userSystemPrompt?.template || agentData?.system?.template || '',
                type: 'agent' as const,
                userHumanPrompt,
                userSystemPrompt,
            };
        }

        const toolData = tools?.[promptId as keyof typeof tools] as DefaultPrompt | undefined;

        if (toolData) {
            const userToolPrompt = userDefined?.find((p) => p.type === toolData.type);

            return {
                data: toolData,
                defaultHumanTemplate: '',
                defaultSystemTemplate: toolData?.template || '',
                displayName: formatPromptId(promptId),
                hasHuman: false,
                humanTemplate: '',
                systemTemplate: userToolPrompt?.template || toolData?.template || '',
                type: 'tool' as const,
                userHumanPrompt: null,
                userSystemPrompt: userToolPrompt,
            };
        }

        return null;
    }, [promptId, data?.settingsPrompts]);

    const variablesData = useMemo(() => {
        if (!promptInfo) {
            return null;
        }

        let variables: string[] = [];
        let formId = '';
        let currentTemplate = '';

        if (activeTab === 'system') {
            variables =
                promptInfo.type === 'agent'
                    ? (promptInfo.data as AgentPrompt | AgentPrompts)?.system?.variables || []
                    : (promptInfo.data as DefaultPrompt)?.variables || [];
            formId = 'system-prompt-form';
            currentTemplate = systemTemplate;
        } else if (activeTab === 'human' && promptInfo.type === 'agent' && promptInfo.hasHuman) {
            variables = (promptInfo.data as AgentPrompts)?.human?.variables || [];
            formId = 'human-prompt-form';
            currentTemplate = humanTemplate;
        }

        return { currentTemplate, formId, variables };
    }, [promptInfo, activeTab, systemTemplate, humanTemplate]);

    const handleVariableClickCallback = useCallback(
        (variable: string) => {
            if (!variablesData) {
                return;
            }

            const field =
                activeTab === 'system'
                    ? {
                          onChange: (value: string) => systemForm.setValue('template', value),
                          value: systemTemplate,
                      }
                    : {
                          onChange: (value: string) => humanForm.setValue('template', value),
                          value: humanTemplate,
                      };
            handleVariableClick(variable, field, variablesData.formId);
        },
        [activeTab, systemTemplate, humanTemplate, variablesData, systemForm, humanForm],
    );

    useEffect(() => {
        if (promptInfo) {
            systemForm.reset({
                template: promptInfo.systemTemplate,
            });
            humanForm.reset({
                template: promptInfo.humanTemplate,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promptInfo]);

    useEffect(() => {
        if (submitError) {
            toast.error(submitError);
        }
    }, [submitError]);

    // Push a synthetic history entry while the form is dirty so a browser-back can be intercepted
    // by popstate below — react-router's blocker doesn't cover the native back gesture.
    useEffect(() => {
        if (isDirty && !hasPushedBlockerStateRef.current) {
            window.history.pushState({ __pentagiBlock__: true }, '');
            hasPushedBlockerStateRef.current = true;
        }
    }, [isDirty]);

    useEffect(() => {
        const handlePopState = () => {
            if (!isDirty) {
                return;
            }

            if (allowBrowserLeaveRef.current) {
                allowBrowserLeaveRef.current = false;

                return;
            }

            setPendingBrowserBack(true);
            setIsLeaveDialogOpen(true);
            window.history.forward();
        };

        window.addEventListener('popstate', handlePopState, { capture: true });

        return () => {
            window.removeEventListener('popstate', handlePopState, { capture: true });
        };
    }, [isDirty]);

    const handleConfirmLeave = () => {
        if (pendingBrowserBack) {
            allowBrowserLeaveRef.current = true;
            setPendingBrowserBack(false);
            window.history.go(-2);

            return;
        }

        navigate(routes.settings.prompts);
    };

    const handleLeaveDialogOpenChange = (open: boolean) => {
        if (!open && pendingBrowserBack) {
            setPendingBrowserBack(false);
        }

        setIsLeaveDialogOpen(open);
    };

    const handleSystemSubmit = async (formData: SystemFormData) => {
        if (!promptInfo) {
            return;
        }

        const isUpdate = !!promptInfo.userSystemPrompt;

        // Submitting an unchanged template would create a no-op userDefined row that masks the default.
        if (!isUpdate && formData.template === promptInfo.defaultSystemTemplate) {
            return;
        }

        try {
            setSubmitError(null);

            let promptType: PromptType;

            if (promptInfo.type === 'agent') {
                const agentData = promptInfo.data as AgentPrompt | AgentPrompts;
                promptType = agentData.system.type;
            } else {
                const toolData = promptInfo.data as DefaultPrompt;
                promptType = toolData.type;
            }

            if (isUpdate) {
                await updatePrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: {
                        promptId: promptInfo.userSystemPrompt!.id,
                        template: formData.template,
                    },
                });
            } else {
                await createPrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: {
                        template: formData.template,
                        type: promptType,
                    },
                });
            }
        } catch (error) {
            console.error('Submit error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while saving');
        }
    };

    const handleHumanSubmit = async (formData: HumanFormData) => {
        if (!promptInfo) {
            return;
        }

        const isUpdate = !!promptInfo.userHumanPrompt;

        // Submitting an unchanged template would create a no-op userDefined row that masks the default.
        if (!isUpdate && formData.template === promptInfo.defaultHumanTemplate) {
            return;
        }

        try {
            setSubmitError(null);

            const agentData = promptInfo.data as AgentPrompts;
            const humanPromptType = agentData.human?.type;

            if (!humanPromptType) {
                setSubmitError('Human prompt type not found');

                return;
            }

            if (isUpdate) {
                await updatePrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: {
                        promptId: promptInfo.userHumanPrompt!.id,
                        template: formData.template,
                    },
                });
            } else {
                await createPrompt({
                    refetchQueries: ['settingsPrompts'],
                    variables: {
                        template: formData.template,
                        type: humanPromptType,
                    },
                });
            }
        } catch (error) {
            console.error('Submit error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while saving');
        }
    };

    const isNew = promptId === 'new';
    const hasOverride =
        (activeTab === 'system' && !!promptInfo?.userSystemPrompt) ||
        (activeTab === 'human' && !!promptInfo?.userHumanPrompt);
    const activeFormId = activeTab === 'system' ? 'system-prompt-form' : 'human-prompt-form';
    const pageHeader = (
        <AppHeader>
            <AppHeaderContent>
                <AppHeaderTitle icon={<FileText className="size-4 shrink-0" />}>
                    {isNew ? 'Create Prompt' : 'Edit Prompt'}
                </AppHeaderTitle>
            </AppHeaderContent>
            {promptInfo && (
                <AppHeaderActions>
                    <AppHeaderAction
                        disabled={isLoading}
                        icon={
                            isValidateLoading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <CheckCircle className="size-4" />
                            )
                        }
                        label={isValidateLoading ? 'Validating...' : 'Validate'}
                        onClick={handleValidate}
                        type="button"
                        variant="outline"
                    />
                    <FormSubmitButton
                        form={activeFormId}
                        icon={<Save className="size-4" />}
                        loading={isLoading}
                        size="sm"
                        variant="secondary"
                    >
                        {isNew ? 'Create' : 'Save'}
                    </FormSubmitButton>
                    {hasOverride && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    aria-label="Prompt actions"
                                    className="size-8 p-0"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Ellipsis />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-24"
                            >
                                <DropdownMenuItem onClick={() => setIsDiffDialogOpen(true)}>
                                    <FileDiff className="size-4" />
                                    Diff
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isLoading}
                                    onClick={handleReset}
                                >
                                    {isDeleteLoading ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="size-4" />
                                    )}
                                    {isDeleteLoading ? 'Resetting...' : 'Reset'}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </AppHeaderActions>
            )}
        </AppHeader>
    );

    if (loading) {
        return (
            <>
                {pageHeader}
                <div className="flex flex-1 items-center justify-center p-4">
                    <StatusCard
                        description="Please wait while we fetch prompt information"
                        icon={<Loader2 className="text-muted-foreground size-16 animate-spin" />}
                        title="Loading prompt data..."
                    />
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                {pageHeader}
                <div className="flex flex-1 items-center justify-center p-4">
                    <StatusCard
                        description={error.message}
                        icon={<AlertCircle className="text-destructive size-16" />}
                        title="Error loading prompt data"
                    />
                </div>
            </>
        );
    }

    if (!promptInfo) {
        return (
            <>
                {pageHeader}
                <div className="flex flex-1 items-center justify-center p-4">
                    <StatusCard
                        description={`The prompt "${promptId}" could not be found or is not supported for editing.`}
                        icon={<AlertCircle className="text-destructive size-16" />}
                        title="Prompt not found"
                    />
                </div>
            </>
        );
    }

    const currentTemplate = activeTab === 'system' ? systemTemplate : humanTemplate;
    const defaultTemplate = activeTab === 'system' ? promptInfo.defaultSystemTemplate : promptInfo.defaultHumanTemplate;

    // ReactDiffViewer styles aligned with shadcn — uses Tailwind CSS vars rather than hard-coded colors.
    const diffStyles = {
        content: {
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.875rem',
            width: '50%',
        },
        diffContainer: {
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
        },
        gutter: {
            borderRight: '1px solid var(--border)',
        },
        line: {
            borderBottom: '1px solid oklch(from var(--border) l c h / 0.50)',
        },
        lineNumber: {
            color: 'var(--muted-foreground)',
        },
        splitView: {
            gap: '0',
        },
        variables: {
            dark: {
                addedBackground: 'hsl(142 70% 45% / 0.50)',
                addedColor: 'var(--foreground)',
                addedGutterBackground: 'hsl(142 70% 45% / 0.40)',
                addedGutterColor: 'var(--muted-foreground)',
                codeFoldBackground: 'var(--muted)',
                codeFoldContentColor: 'var(--muted-foreground)',
                codeFoldGutterBackground: 'var(--muted)',
                diffViewerBackground: 'var(--background)',
                diffViewerColor: 'var(--foreground)',
                diffViewerTitleBackground: 'var(--card)',
                diffViewerTitleBorderColor: 'var(--border)',
                diffViewerTitleColor: 'var(--card-foreground)',
                emptyLineBackground: 'var(--background)',
                gutterBackground: 'var(--muted)',
                gutterBackgroundDark: 'var(--muted)',
                gutterColor: 'var(--muted-foreground)',
                highlightBackground: 'oklch(from var(--primary) l c h / 0.20)',
                highlightGutterBackground: 'oklch(from var(--primary) l c h / 0.30)',
                removedBackground: 'oklch(from var(--destructive) l c h / 0.50)',
                removedColor: 'var(--foreground)',
                removedGutterBackground: 'oklch(from var(--destructive) l c h / 0.40)',
                removedGutterColor: 'var(--muted-foreground)',
                wordAddedBackground: 'hsl(142 70% 45% / 0.70)',
                wordRemovedBackground: 'oklch(from var(--destructive) l c h / 0.70)',
            },
            light: {
                addedBackground: 'hsl(142 70% 45% / 0.50)',
                addedColor: 'var(--foreground)',
                addedGutterBackground: 'hsl(142 70% 45% / 0.40)',
                addedGutterColor: 'var(--muted-foreground)',
                codeFoldBackground: 'var(--muted)',
                codeFoldContentColor: 'var(--muted-foreground)',
                codeFoldGutterBackground: 'var(--muted)',
                diffViewerBackground: 'var(--background)',
                diffViewerColor: 'var(--foreground)',
                diffViewerTitleBackground: 'var(--card)',
                diffViewerTitleBorderColor: 'var(--border)',
                diffViewerTitleColor: 'var(--card-foreground)',
                emptyLineBackground: 'var(--background)',
                gutterBackground: 'var(--muted)',
                gutterBackgroundDark: 'var(--muted)',
                gutterColor: 'var(--muted-foreground)',
                highlightBackground: 'oklch(from var(--primary) l c h / 0.20)',
                highlightGutterBackground: 'oklch(from var(--primary) l c h / 0.30)',
                removedBackground: 'oklch(from var(--destructive) l c h / 0.50)',
                removedColor: 'var(--foreground)',
                removedGutterBackground: 'oklch(from var(--destructive) l c h / 0.40)',
                removedGutterColor: 'var(--muted-foreground)',
                wordAddedBackground: 'hsl(142 70% 45% / 0.70)',
                wordRemovedBackground: 'oklch(from var(--destructive) l c h / 0.70)',
            },
        },
    };

    const promptMeta = (
        <>
            <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="text-2xl font-semibold">{isNew ? 'Create a prompt' : 'Edit prompt'}</h2>
                <p className="text-muted-foreground">
                    {promptInfo.type === 'agent'
                        ? 'Customize the templates this agent uses'
                        : 'Customize the template this tool uses'}
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                    {promptInfo.type === 'agent' ? (
                        <Bot className="text-muted-foreground size-5" />
                    ) : (
                        <Wrench className="text-muted-foreground size-5" />
                    )}
                    {promptInfo.displayName}
                </h3>
                <p className="text-muted-foreground text-sm">
                    {promptInfo.type === 'agent'
                        ? 'Configure prompts for this AI agent'
                        : 'Configure the prompt for this tool'}
                </p>
            </div>

            <TabsList className="bg-background w-full">
                <TabsTrigger
                    className="data-[state=active]:bg-card flex-1"
                    value="system"
                >
                    <Code className="size-4" />
                    System Prompt
                </TabsTrigger>
                {promptInfo.type === 'agent' && promptInfo.hasHuman && (
                    <TabsTrigger
                        className="data-[state=active]:bg-card flex-1"
                        value="human"
                    >
                        <User className="size-4" />
                        Human Prompt
                    </TabsTrigger>
                )}
            </TabsList>

            {variablesData && (
                <Variables
                    currentTemplate={variablesData.currentTemplate}
                    onVariableClick={handleVariableClickCallback}
                    variables={variablesData.variables}
                />
            )}
        </>
    );

    const promptEditor = (
        <>
            <TabsContent
                className="mt-0 flex min-h-0 flex-1 flex-col"
                value="system"
            >
                <Form {...systemForm}>
                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        id="system-prompt-form"
                        onSubmit={systemForm.handleSubmit(handleSystemSubmit)}
                    >
                        <FormTextareaItem
                            control={systemForm.control}
                            disabled={isLoading}
                            name="template"
                            placeholder={
                                promptInfo.type === 'tool'
                                    ? 'Enter the tool template...'
                                    : 'Enter the system prompt template...'
                            }
                        />
                    </form>
                </Form>
            </TabsContent>

            {promptInfo.type === 'agent' && promptInfo.hasHuman && (
                <TabsContent
                    className="mt-0 flex min-h-0 flex-1 flex-col"
                    value="human"
                >
                    <Form {...humanForm}>
                        <form
                            className="flex min-h-0 flex-1 flex-col"
                            id="human-prompt-form"
                            onSubmit={humanForm.handleSubmit(handleHumanSubmit)}
                        >
                            <FormTextareaItem
                                control={humanForm.control}
                                disabled={isLoading}
                                name="template"
                                placeholder="Enter the human prompt template..."
                            />
                        </form>
                    </Form>
                </TabsContent>
            )}
        </>
    );

    return (
        <div className={isDesktop ? 'flex h-[100dvh] min-h-0 flex-col' : 'flex min-h-[100dvh] flex-col'}>
            {pageHeader}
            <Tabs
                className="flex min-h-0 flex-1 flex-col"
                onValueChange={(value) => setActiveTab(value as 'human' | 'system')}
                value={activeTab}
            >
                {isDesktop ? (
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
                                        <CardContent className="flex flex-col gap-6 py-6">{promptMeta}</CardContent>
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
                                <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">{promptEditor}</div>
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                        {promptMeta}
                        {promptEditor}
                    </div>
                )}
            </Tabs>

            <ConfirmationDialog
                cancelText="Cancel"
                cancelVariant="outline"
                confirmIcon={<RotateCcw />}
                confirmText="Reset"
                confirmVariant="destructive"
                description="Are you sure you want to reset this prompt to its default value? This action cannot be undone."
                handleConfirm={handleConfirmReset}
                handleOpenChange={setResetDialogOpen}
                isOpen={resetDialogOpen}
                itemName={`${activeTab} prompt`}
                itemType="template"
                title="Reset Prompt"
            />

            <ConfirmationDialog
                cancelText="Stay"
                confirmIcon={undefined}
                confirmText="Leave"
                confirmVariant="destructive"
                description="You have unsaved changes. Are you sure you want to leave without saving?"
                handleConfirm={handleConfirmLeave}
                handleOpenChange={handleLeaveDialogOpenChange}
                isOpen={isLeaveDialogOpen}
                title="Discard changes?"
            />

            <Dialog
                onOpenChange={setValidationDialogOpen}
                open={validationDialogOpen}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="size-5" />
                            Validation Results
                        </DialogTitle>
                        <DialogDescription>
                            The validation result for the {activeTab} prompt template.
                        </DialogDescription>
                    </DialogHeader>

                    {validationResult && (
                        <div className="flex flex-col gap-4">
                            <Alert variant={validationResult.result ? 'default' : 'destructive'}>
                                {validationResult.result === 'success' ? (
                                    <CheckCircle className="size-4 text-green-500!" />
                                ) : (
                                    <XCircle className="size-4 text-red-500!" />
                                )}
                                <AlertTitle>
                                    {validationResult.result === 'success' ? 'Valid Template' : 'Validation Error'}
                                </AlertTitle>
                                <AlertDescription>
                                    <div className="whitespace-pre-line">
                                        {validationResult.message}
                                        {validationResult.details && (
                                            <div className="mt-2">
                                                <strong>Details:</strong> {validationResult.details}
                                            </div>
                                        )}
                                        {validationResult.line && (
                                            <div className="mt-1">
                                                <strong>Line:</strong> {validationResult.line}
                                            </div>
                                        )}
                                    </div>
                                </AlertDescription>
                            </Alert>

                            <div className="flex justify-end">
                                <Button onClick={() => setValidationDialogOpen(false)}>Close</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                onOpenChange={setIsDiffDialogOpen}
                open={isDiffDialogOpen}
            >
                <DialogContent className="max-w-7xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileDiff className="size-5" />
                            Diff
                        </DialogTitle>
                        <DialogDescription>Changes between current value and default template.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[70vh] overflow-auto">
                        <ReactDiffViewer
                            newValue={currentTemplate}
                            oldValue={defaultTemplate}
                            splitView
                            styles={diffStyles}
                            useDarkTheme
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Variables({ currentTemplate, onVariableClick, variables }: VariablesProps) {
    if (variables.length === 0) {
        return null;
    }

    const usedVariables = getUsedVariables(currentTemplate);

    return (
        <div className="bg-muted/50 rounded-md border p-3">
            <h4 className="text-muted-foreground mb-2 text-sm font-medium">Available Variables:</h4>
            <div className="flex flex-wrap gap-1">
                {variables.map((variable) => {
                    const isUsed = usedVariables.has(variable);

                    return (
                        <code
                            className={`cursor-pointer rounded border px-2 py-1 font-mono text-xs transition-colors ${
                                isUsed
                                    ? 'border-green-300 bg-green-100 text-green-800 hover:bg-green-200'
                                    : 'bg-background text-foreground hover:bg-accent'
                            }`}
                            key={variable}
                            onClick={() => onVariableClick(variable)}
                        >
                            {`{{.${variable}}}`}
                        </code>
                    );
                })}
            </div>
        </div>
    );
}

export default SettingsPrompt;
