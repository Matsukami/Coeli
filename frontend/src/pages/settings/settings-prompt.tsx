import { useMutation, useQuery } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    AlertCircle,
    Bot,
    Check,
    CheckCircle,
    Code,
    Ellipsis,
    FileDiff,
    FileText,
    Loader2,
    RotateCcw,
    Save,
    User,
    Wrench,
    XCircle,
} from 'lucide-react';
import {
    type ComponentProps,
    lazy,
    type Ref,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import {
    type Control,
    type FieldPathByValue,
    type FieldValues,
    useController,
    useForm,
    useFormState,
    useWatch,
} from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import type {
    DefaultPromptFragmentFragment as DefaultPrompt,
    PromptType,
    ValidatePromptMutation,
} from '@/graphql/types';

import { type EditorViewMode, EditorViewModeToggle, findVariableUseRanges, type MarkdownEditorHandle, VARIABLE_RE, variableProbe } from '@/components/shared/markdown-editor';

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
import { DetailTwoPanelLayout } from '@/components/shared/detail-two-panel-layout';
import { UnsavedChangesDialog, useUnsavedChangesGuard } from '@/components/shared/unsaved-changes';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
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
import { cn } from '@/lib/utils';

// Dynamic-only import: a static import would merge the tiptap editor chunk into this route bundle.
const MarkdownEditor = lazy(() =>
    import('@/components/shared/markdown-editor').then((module) => ({ default: module.MarkdownEditor })),
);

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

interface FormCodeItemProps<T extends FieldValues> extends ControllerProps<T> {
    editorRef?: Ref<MarkdownEditorHandle>;
    placeholder?: string;
}

interface FormTextareaItemProps<T extends FieldValues> extends BaseFieldProps<T>, BaseTextareaProps {
    description?: string;
}

type HumanFormData = z.infer<typeof humanFormSchema>;

type SystemFormData = z.infer<typeof systemFormSchema>;

// One pass over the `{{ … }}` blocks — the naive per-variable `.match` over the whole template is
// O(variables × length) on every keystroke.
function countVariableUses(template: string, variables: string[]): Record<string, number> {
    const probes = variables.map((variable) => [variable, variableProbe(variable)] as const);
    const counts: Record<string, number> = {};

    for (const block of template.match(VARIABLE_RE) ?? []) {
        for (const [variable, probe] of probes) {
            if (probe.test(block)) {
                counts[variable] = (counts[variable] ?? 0) + 1;
            }
        }
    }

    return counts;
}

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
} satisfies ComponentProps<typeof ReactDiffViewer>['styles'];

function FormCodeItem<T extends FieldValues>({
    control,
    disabled,
    editorRef,
    name,
    placeholder,
}: FormCodeItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        disabled,
        name,
    });

    return (
        <FormItem className="flex min-h-0 flex-1 flex-col">
            <FormControl>
                <Suspense
                    fallback={
                        <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border">
                            <Loader2 className="text-muted-foreground size-5 animate-spin" />
                        </div>
                    }
                >
                    <MarkdownEditor
                        className="min-h-0 flex-1"
                        disabled={disabled}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        placeholder={placeholder}
                        ref={editorRef}
                        value={field.value}
                    />
                </Suspense>
            </FormControl>
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

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

// Pixel offset of `position` from the textarea content top, measured via a hidden mirror so
// soft-wrapped lines count — a logical-line count undershoots the scroll badly for wrapped templates.
const caretOffsetTop = (textarea: HTMLTextAreaElement, position: number): number => {
    const cs = getComputedStyle(textarea);
    const mirror = document.createElement('div');

    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.fontWeight = cs.fontWeight;
    mirror.style.fontStyle = cs.fontStyle;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.wordSpacing = cs.wordSpacing;
    mirror.style.paddingTop = cs.paddingTop;
    mirror.style.paddingRight = cs.paddingRight;
    mirror.style.paddingBottom = cs.paddingBottom;
    mirror.style.paddingLeft = cs.paddingLeft;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.boxSizing = 'border-box';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';

    mirror.textContent = textarea.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = textarea.value.charAt(position) || '.';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const offset = marker.offsetTop;
    mirror.remove();

    return offset;
};

interface DiffContentProps {
    control: Control<HumanFormData> | Control<SystemFormData>;
    oldValue: string;
    styles: ComponentProps<typeof ReactDiffViewer>['styles'];
}

interface VariablesPanelContainerProps {
    control: Control<HumanFormData> | Control<SystemFormData>;
    onVariableClick: (variable: string) => void;
    variables: string[];
}

interface VariablesProps {
    currentTemplate: string;
    onVariableClick: (variable: string) => void;
    variables: string[];
}

// Don't hoist this useWatch to the parent — it would re-subscribe the whole page per keystroke.
function DiffContent({ control, oldValue, styles }: DiffContentProps) {
    const newValue = useWatch({ control, name: 'template' });

    return (
        <ReactDiffViewer
            newValue={newValue}
            oldValue={oldValue}
            splitView
            styles={styles}
            useDarkTheme
        />
    );
}

function SettingsPrompt() {
    const { promptId } = useParams<{ promptId: string }>();
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
    const [viewMode, setViewMode] = useState<EditorViewMode>('rich');
    const editorRef = useRef<MarkdownEditorHandle>(null);

    const isLoading = isCreateLoading || isUpdateLoading || isDeleteLoading || isValidateLoading;

    const handleVariableClick = useCallback(
        (variable: string, field: { onChange: (value: string) => void; value: string }, formId: string) => {
            if (viewMode === 'rich') {
                if (!editorRef.current?.cycleToVariable(variable)) {
                    editorRef.current?.insertAtCursor(`{{.${variable}}}`);
                }

                return;
            }

            const textarea = document.querySelector(`#${formId} textarea`) as HTMLTextAreaElement;

            if (textarea) {
                const currentValue = field.value || '';
                const variablePattern = `{{.${variable}}}`;
                const matches = findVariableUseRanges(currentValue, variable);

                if (matches.length > 0) {
                    const { selectionEnd, selectionStart } = textarea;
                    const currentIndex = matches.findIndex(
                        (match) => match.index === selectionStart && match.index + match.length === selectionEnd,
                    );
                    const target =
                        currentIndex >= 0
                            ? matches[(currentIndex + 1) % matches.length]
                            : (matches.find((match) => match.index >= selectionStart) ?? matches[0]);

                    if (target) {
                        const matchStart = target.index;
                        textarea.focus();
                        textarea.setSelectionRange(matchStart, matchStart + target.length);
                        textarea.scrollTop = Math.max(
                            0,
                            caretOffsetTop(textarea, matchStart) - textarea.clientHeight / 2,
                        );
                    }
                } else {
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const newValue =
                        currentValue.slice(0, Math.max(0, start)) +
                        variablePattern +
                        currentValue.slice(Math.max(0, end));
                    field.onChange(newValue);

                    setTimeout(() => {
                        textarea.focus({ preventScroll: true });
                        textarea.setSelectionRange(start + variablePattern.length, start + variablePattern.length);
                    }, 0);
                }
            }
        },
        [viewMode],
    );

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

                currentTemplate = systemForm.getValues('template');
            } else {
                const agentData = promptInfo.data as AgentPrompts;
                promptType = agentData.human!.type;
                currentTemplate = humanForm.getValues('template');
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
        mode: 'onTouched',
        resetOptions: { keepDirtyValues: true },
        resolver: zodResolver(systemFormSchema),
    });

    const humanForm = useForm<HumanFormData>({
        defaultValues: {
            template: '',
        },
        mode: 'onTouched',
        resetOptions: { keepDirtyValues: true },
        resolver: zodResolver(humanFormSchema),
    });

    const { isDirty: isSystemDirty, isValid: isSystemValid } = useFormState({ control: systemForm.control });
    const { isDirty: isHumanDirty, isValid: isHumanValid } = useFormState({ control: humanForm.control });
    const isDirty = isSystemDirty || isHumanDirty;

    const activeControl = activeTab === 'system' ? systemForm.control : humanForm.control;

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

        if (activeTab === 'system') {
            variables =
                promptInfo.type === 'agent'
                    ? (promptInfo.data as AgentPrompt | AgentPrompts)?.system?.variables || []
                    : (promptInfo.data as DefaultPrompt)?.variables || [];
            formId = 'system-prompt-form';
        } else if (activeTab === 'human' && promptInfo.type === 'agent' && promptInfo.hasHuman) {
            variables = (promptInfo.data as AgentPrompts)?.human?.variables || [];
            formId = 'human-prompt-form';
        }

        return { formId, variables };
    }, [promptInfo, activeTab]);

    const handleVariableClickCallback = useCallback(
        (variable: string) => {
            if (!variablesData) {
                return;
            }

            const field =
                activeTab === 'system'
                    ? {
                          onChange: (value: string) => systemForm.setValue('template', value, { shouldDirty: true }),
                          value: systemForm.getValues('template'),
                      }
                    : {
                          onChange: (value: string) => humanForm.setValue('template', value, { shouldDirty: true }),
                          value: humanForm.getValues('template'),
                      };
            handleVariableClick(variable, field, variablesData.formId);
        },
        [activeTab, variablesData, systemForm, humanForm, handleVariableClick],
    );

    // Re-sync both tabs to the server prompt. A Save refetches settingsPrompts → promptInfo gets a new
    // identity → this fires; keepDirtyValues (on both form configs) preserves the OTHER tab's unsaved edits,
    // which an unguarded reset would silently wipe.
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

    const handleSystemSubmit = async (formData: SystemFormData): Promise<boolean> => {
        if (!promptInfo) {
            return false;
        }

        const isUpdate = !!promptInfo.userSystemPrompt;

        // Submitting an unchanged template would create a no-op userDefined row that masks the default.
        if (!isUpdate && formData.template === promptInfo.defaultSystemTemplate) {
            return true;
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

            return true;
        } catch (error) {
            console.error('Submit error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while saving');

            return false;
        }
    };

    const handleHumanSubmit = async (formData: HumanFormData): Promise<boolean> => {
        if (!promptInfo) {
            return false;
        }

        const isUpdate = !!promptInfo.userHumanPrompt;

        // Submitting an unchanged template would create a no-op userDefined row that masks the default.
        if (!isUpdate && formData.template === promptInfo.defaultHumanTemplate) {
            return true;
        }

        try {
            setSubmitError(null);

            const agentData = promptInfo.data as AgentPrompts;
            const humanPromptType = agentData.human?.type;

            if (!humanPromptType) {
                setSubmitError('Human prompt type not found');

                return false;
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

            return true;
        } catch (error) {
            console.error('Submit error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while saving');

            return false;
        }
    };

    const isFormValid = (!isSystemDirty || isSystemValid) && (!isHumanDirty || isHumanValid);

    const onSaveAndLeave = async (): Promise<boolean> => {
        const systemDirty = isSystemDirty;
        const humanDirty = isHumanDirty;

        if (systemDirty && !(await systemForm.trigger())) {
            return false;
        }

        if (humanDirty && !(await humanForm.trigger())) {
            return false;
        }

        // Snapshot both tabs before awaiting: a save refetch resets the forms, which would
        // otherwise clobber the still-unsaved other tab's value mid-flight.
        const systemValues = systemForm.getValues();
        const humanValues = humanForm.getValues();
        let saved = true;

        if (systemDirty) {
            saved = (await handleSystemSubmit(systemValues)) && saved;
        }

        if (humanDirty) {
            saved = (await handleHumanSubmit(humanValues)) && saved;
        }

        return saved;
    };

    const unsavedGuard = useUnsavedChangesGuard({
        isDirty,
        isFormValid,
        onSave: onSaveAndLeave,
    });

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
                            {hasOverride && (
                                <>
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
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            <DropdownMenuItem
                                className="cursor-default gap-4 hover:bg-transparent focus:bg-transparent"
                                onSelect={(event) => event.preventDefault()}
                            >
                                View
                                <EditorViewModeToggle
                                    className="-my-1.5 -mr-2 ml-auto"
                                    mode={viewMode}
                                    onModeChange={setViewMode}
                                    rawTooltip="Edit the raw prompt template"
                                />
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
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

    const defaultTemplate = activeTab === 'system' ? promptInfo.defaultSystemTemplate : promptInfo.defaultHumanTemplate;
    const hasHumanPrompt = promptInfo.type === 'agent' && promptInfo.hasHuman;

    const promptMeta = (
        <>
            <div className="flex flex-col gap-2 text-center">
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

            <TabsList className="dark:bg-background w-full">
                <TabsTrigger
                    className="dark:data-[state=active]:bg-card flex-1"
                    value="system"
                >
                    <Code className="size-4" />
                    System Prompt
                </TabsTrigger>
                <TabsTrigger
                    className="dark:data-[state=active]:bg-card flex-1"
                    disabled={!hasHumanPrompt}
                    value="human"
                >
                    <User className="size-4" />
                    Human Prompt
                </TabsTrigger>
            </TabsList>
        </>
    );

    const variablesPanel = variablesData ? (
        <VariablesPanelContainer
            control={activeControl}
            onVariableClick={handleVariableClickCallback}
            variables={variablesData.variables}
        />
    ) : null;

    const systemPlaceholder =
        promptInfo.type === 'tool' ? 'Enter the tool template...' : 'Enter the system prompt template...';

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
                        {viewMode === 'rich' ? (
                            <FormCodeItem
                                control={systemForm.control}
                                disabled={isLoading}
                                editorRef={editorRef}
                                name="template"
                                placeholder={systemPlaceholder}
                            />
                        ) : (
                            <FormTextareaItem
                                control={systemForm.control}
                                disabled={isLoading}
                                name="template"
                                placeholder={systemPlaceholder}
                            />
                        )}
                    </form>
                </Form>
            </TabsContent>

            {hasHumanPrompt && (
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
                            {viewMode === 'rich' ? (
                                <FormCodeItem
                                    control={humanForm.control}
                                    disabled={isLoading}
                                    editorRef={editorRef}
                                    name="template"
                                    placeholder="Enter the human prompt template..."
                                />
                            ) : (
                                <FormTextareaItem
                                    control={humanForm.control}
                                    disabled={isLoading}
                                    name="template"
                                    placeholder="Enter the human prompt template..."
                                />
                            )}
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
                    <DetailTwoPanelLayout
                        left={
                            <>
                                {promptMeta}
                                {variablesPanel}
                            </>
                        }
                        right={promptEditor}
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                        {promptMeta}
                        {promptEditor}
                        {variablesPanel}
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

            <UnsavedChangesDialog
                canSave={isFormValid}
                handleCancel={unsavedGuard.handleCancel}
                handleDiscard={unsavedGuard.handleDiscard}
                handleOpenChange={unsavedGuard.handleOpenChange}
                handleSaveAndLeave={unsavedGuard.handleSaveAndLeave}
                isOpen={unsavedGuard.isOpen}
                isSavingFromDialog={unsavedGuard.isSavingFromDialog}
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
                        <DiffContent
                            control={activeControl}
                            oldValue={defaultTemplate}
                            styles={diffStyles}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Variables({ currentTemplate, onVariableClick, variables }: VariablesProps) {
    const counts = useMemo(() => countVariableUses(currentTemplate, variables), [currentTemplate, variables]);

    if (variables.length === 0) {
        return null;
    }

    return (
        <div className="bg-card overflow-hidden rounded-lg border">
            <div className="border-b px-4 py-3">
                <h4 className="text-sm font-medium">Available variables</h4>
                <p className="text-muted-foreground mt-1 text-xs">
                    Click to insert at the cursor, or cycle through existing uses.
                </p>
            </div>
            <div className="bg-background flex flex-wrap gap-1.5 px-4 py-3">
                {variables.map((variable) => {
                    const count = counts[variable] ?? 0;
                    const isUsed = count > 0;
                    const action = isUsed
                        ? `Go to next {{.${variable}}} in the template${count > 1 ? ` (${count} uses)` : ''}`
                        : `Insert {{.${variable}}} at the cursor`;

                    return (
                        <Badge
                            aria-label={action}
                            className="cursor-pointer font-mono font-normal"
                            key={variable}
                            onClick={() => onVariableClick(variable)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onVariableClick(variable);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            title={action}
                            variant={isUsed ? 'green' : 'secondary'}
                        >
                            {isUsed ? <Check className="size-3" /> : null}
                            {`{{.${variable}}}`}
                            {count > 1 ? (
                                <span className="ml-0.5 text-[10px] tabular-nums opacity-70">×{count}</span>
                            ) : null}
                        </Badge>
                    );
                })}
            </div>
        </div>
    );
}

// Don't hoist this useWatch to the parent — it would re-subscribe the whole page per keystroke.
function VariablesPanelContainer({ control, onVariableClick, variables }: VariablesPanelContainerProps) {
    const currentTemplate = useWatch({ control, name: 'template' });

    return (
        <Variables
            currentTemplate={currentTemplate}
            onVariableClick={onVariableClick}
            variables={variables}
        />
    );
}

export default SettingsPrompt;
