import { useMutation, useQuery } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    AlertCircle,
    Check,
    CheckCircle,
    ChevronsUpDown,
    Clock,
    Cpu,
    Lightbulb,
    Loader2,
    Play,
    Save,
    Trash2,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    type Control,
    type FieldPath,
    type FieldValues,
    useController,
    useForm,
    useFormState,
    useWatch,
} from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import type { AgentConfigInput, AgentsConfigInput, ProviderConfigFragmentFragment } from '@/graphql/types';

import ConfirmationDialog from '@/components/shared/confirmation-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusCard } from '@/components/ui/status-card';
import {
    AgentConfigType,
    CreateProviderDocument,
    DeleteProviderDocument,
    ModelReasoningMode,
    ProviderType,
    ReasoningEffort,
    ReasoningMode,
    SettingsProvidersDocument,
    TestAgentDocument,
    TestProviderDocument,
    UpdateProviderDocument,
} from '@/graphql/types';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

interface ProviderTest {
    error?: null | string;
    latency?: null | number;
    name?: null | string;
    reasoning?: boolean | null;
    result?: boolean | null;
    streaming?: boolean | null;
    type?: null | string;
}

type ProviderTestResults = Record<string, null | undefined | { tests?: null | ProviderTest[] }>;

const formatFieldName = (fieldPath: string): string =>
    fieldPath
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll(/([A-Z])/g, ' $1'))
        .join(' → ');

const getErrorMessage = (error: unknown): string | undefined =>
    typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : undefined;

const formatFormErrors = (errors: Record<string, unknown>, prefix = ''): string =>
    Object.entries(errors)
        .flatMap(([field, error]) => {
            const path = prefix ? `${prefix}.${field}` : field;
            const message = getErrorMessage(error);

            if (message) {
                return [`• ${formatFieldName(path)}: ${message}`];
            }

            if (error && typeof error === 'object') {
                const nested = formatFormErrors(error as Record<string, unknown>, path);

                return nested ? [nested] : [];
            }

            return [];
        })
        .join('\n');

interface BaseFieldProps<T extends FieldValues = FieldValues> extends ControllerProps<T> {
    label: string;
}

interface BaseInputProps {
    placeholder?: string;
}

interface ControllerProps<T extends FieldValues = FieldValues> {
    control: Control<T>;
    disabled?: boolean;
    name: FieldPath<T>;
}

interface FormComboboxItemProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T>, BaseInputProps {
    allowCustom?: boolean;
    contentClass?: string;
    description?: string;
    options: string[];
}

interface FormInputNumberItemProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T>, NumberInputProps {
    description?: string;
    valueType?: 'float' | 'integer';
}

interface FormInputStringItemProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T>, BaseInputProps {
    description?: string;
}

interface FormModelComboboxItemProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T>, BaseInputProps {
    allowCustom?: boolean;
    contentClass?: string;
    description?: string;
    onOptionSelect?: (option: ModelOption) => void;
    options: ModelOption[];
}

interface ModelOption {
    name: string;
    price?: null | { cacheRead: number; cacheWrite: number; input: number; output: number };
    reasoning?: null | { efforts?: null | ReasoningEffort[]; mode?: ModelReasoningMode | null };
    thinking?: boolean | null;
}

interface NumberInputProps extends BaseInputProps {
    max?: string;
    min?: string;
    step?: string;
}

type Provider = ProviderConfigFragmentFragment;

function FormComboboxItem<T extends FieldValues = FieldValues>({
    allowCustom = true,
    contentClass,
    control,
    description,
    disabled,
    label,
    name,
    options,
    placeholder,
}: FormComboboxItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        defaultValue: undefined,
        disabled,
        name,
    });

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredOptions = options.filter((option) => option?.toLowerCase().includes(search?.toLowerCase()));

    const displayValue = field.value ?? '';

    return (
        <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
                <Popover
                    onOpenChange={setIsOpen}
                    open={isOpen}
                >
                    <PopoverTrigger asChild>
                        <Button
                            className={cn('w-full justify-between', !displayValue && 'text-muted-foreground')}
                            disabled={disabled}
                            variant="outline"
                        >
                            {displayValue || placeholder}
                            <ChevronsUpDown className="opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className={cn(contentClass, 'p-0')}
                        style={{
                            maxHeight: 'var(--radix-popover-content-available-height)',
                            width: 'var(--radix-popover-trigger-width)',
                        }}
                    >
                        <Command>
                            <CommandInput
                                className="h-9"
                                onValueChange={setSearch}
                                placeholder={`Search ${label.toLowerCase()}...`}
                                value={search}
                            />
                            <CommandList>
                                <CommandEmpty>
                                    <div className="py-2 text-center">
                                        <p className="text-muted-foreground text-sm">No {label.toLowerCase()} found.</p>
                                        {search && allowCustom && (
                                            <Button
                                                className="mt-2"
                                                onClick={() => {
                                                    field.onChange(search);
                                                    setIsOpen(false);
                                                    setSearch('');
                                                }}
                                                size="sm"
                                                variant="ghost"
                                            >
                                                Use "{search}" as custom {label.toLowerCase()}
                                            </Button>
                                        )}
                                    </div>
                                </CommandEmpty>
                                <CommandGroup>
                                    {filteredOptions.map((option) => (
                                        <CommandItem
                                            key={option}
                                            onSelect={() => {
                                                field.onChange(option);
                                                setIsOpen(false);
                                                setSearch('');
                                            }}
                                            value={option}
                                        >
                                            {option}
                                            <Check
                                                className={cn(
                                                    'ml-auto',
                                                    displayValue === option ? 'opacity-100' : 'opacity-0',
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

function FormInputNumberItem<T extends FieldValues = FieldValues>({
    control,
    description,
    disabled,
    label,
    max,
    min,
    name,
    placeholder,
    step,
    valueType = 'float',
}: FormInputNumberItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        defaultValue: undefined,
        disabled,
        name,
    });

    const parseValue = (value: string) => {
        if (value === '') {
            return null;
        }

        return valueType === 'float' ? Number.parseFloat(value) : Number.parseInt(value);
    };

    const inputProps = {
        max,
        min,
        placeholder,
        step,
        type: 'number' as const,
    };

    return (
        <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
                <Input
                    {...field}
                    {...inputProps}
                    onChange={(event) => {
                        const { value } = event.target;
                        field.onChange(parseValue(value));
                    }}
                    value={field.value ?? ''}
                />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

function FormInputStringItem<T extends FieldValues = FieldValues>({
    control,
    description,
    disabled,
    label,
    name,
    placeholder,
}: FormInputStringItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        defaultValue: undefined,
        disabled,
        name,
    });

    const inputProps = { placeholder };

    return (
        <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
                <Input
                    {...field}
                    {...inputProps}
                    value={field.value ?? ''}
                />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

function FormModelComboboxItem<T extends FieldValues = FieldValues>({
    allowCustom = true,
    contentClass,
    control,
    description,
    disabled,
    label,
    name,
    onOptionSelect,
    options,
    placeholder,
}: FormModelComboboxItemProps<T>) {
    const { field, fieldState } = useController({
        control,
        defaultValue: undefined,
        disabled,
        name,
    });

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredOptions = options.filter((option) => option.name?.toLowerCase().includes(search?.toLowerCase()));

    const displayValue = field.value ?? '';

    const formatPrice = (
        price?: null | { cacheRead: number; cacheWrite: number; input: number; output: number },
    ): string => {
        if (!price || ((!price.input || price.input === 0) && (!price.output || price.output === 0))) {
            return 'free';
        }

        const formatValue = (value: number): string => {
            return value.toFixed(6).replace(/\.?0+$/, '');
        };

        const basePrice = `$${formatValue(price.input)}/$${formatValue(price.output)}`;

        const hasCachePrices = (price.cacheRead && price.cacheRead > 0) || (price.cacheWrite && price.cacheWrite > 0);

        if (hasCachePrices) {
            const cacheParts: string[] = [];

            if (price.cacheRead && price.cacheRead > 0) {
                cacheParts.push(`R:$${formatValue(price.cacheRead)}`);
            }

            if (price.cacheWrite && price.cacheWrite > 0) {
                cacheParts.push(`W:$${formatValue(price.cacheWrite)}`);
            }

            return `${basePrice} (${cacheParts.join(', ')})`;
        }

        return basePrice;
    };

    return (
        <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
                <Popover
                    onOpenChange={setIsOpen}
                    open={isOpen}
                >
                    <div className="flex w-full">
                        {/* Input field - main control */}
                        <Input
                            className="rounded-r-none border-r-0 focus-visible:z-10"
                            disabled={disabled}
                            onChange={(event) => field.onChange(event.target.value)}
                            placeholder={placeholder}
                            value={displayValue}
                        />
                        {/* Dropdown trigger button */}
                        <PopoverTrigger asChild>
                            <Button
                                className="rounded-l-none border-l-0 px-3 hover:z-10"
                                disabled={disabled}
                                type="button"
                                variant="outline"
                            >
                                <ChevronsUpDown className="size-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className={cn(contentClass, 'w-80 p-0 sm:w-[480px] md:w-[640px]')}
                        >
                            <Command>
                                <CommandInput
                                    className="h-9"
                                    onValueChange={setSearch}
                                    placeholder={`Search ${label.toLowerCase()}...`}
                                    value={search}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        <div className="py-2 text-center">
                                            <p className="text-muted-foreground text-sm">
                                                No {label.toLowerCase()} found.
                                            </p>
                                            {search && allowCustom && (
                                                <Button
                                                    className="mt-2"
                                                    onClick={() => {
                                                        field.onChange(search);
                                                        setIsOpen(false);
                                                        setSearch('');
                                                    }}
                                                    size="sm"
                                                    variant="ghost"
                                                >
                                                    Use "{search}" as custom {label.toLowerCase()}
                                                </Button>
                                            )}
                                        </div>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {filteredOptions.map((option) => (
                                            <CommandItem
                                                key={option.name}
                                                onSelect={() => {
                                                    field.onChange(option.name);
                                                    onOptionSelect?.(option);
                                                    setIsOpen(false);
                                                    setSearch('');
                                                }}
                                                value={option.name}
                                            >
                                                <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate">{option.name}</span>
                                                        {option.thinking && (
                                                            <Lightbulb className="text-muted-foreground size-3" />
                                                        )}
                                                    </div>
                                                    <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                                                        {formatPrice(option.price)}
                                                    </span>
                                                </div>
                                                <Check
                                                    className={cn(
                                                        'ml-auto',
                                                        displayValue === option.name ? 'opacity-100' : 'opacity-0',
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </div>
                </Popover>
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
        </FormItem>
    );
}

const optionalNumber = z.number().nullable().optional();

const requiredString = (message: string) =>
    z
        .string()
        .optional()
        .transform((value) => value ?? '')
        .pipe(z.string().min(1, message));

const agentConfigSchema = z
    .object({
        frequencyPenalty: optionalNumber,
        maxLength: optionalNumber,
        maxTokens: optionalNumber,
        minLength: optionalNumber,
        model: requiredString('Model is required'),
        presencePenalty: optionalNumber,
        price: z
            .object({
                cacheRead: optionalNumber,
                cacheWrite: optionalNumber,
                input: optionalNumber,
                output: optionalNumber,
            })
            .nullable()
            .optional(),
        reasoning: z
            .object({
                effort: z.string().nullable().optional(),
                maxTokens: optionalNumber,
                mode: z.string().nullable().optional(),
            })
            .nullable()
            .optional(),
        repetitionPenalty: optionalNumber,
        temperature: optionalNumber,
        topK: optionalNumber,
        topP: optionalNumber,
    })
    .optional();

const formSchema = z.object({
    agents: z.record(z.string(), agentConfigSchema).optional(),
    name: requiredString('Provider name is required').pipe(z.string().max(50, 'Maximum 50 characters allowed')),
    type: requiredString('Provider type is required'),
});

type FormAgents = FormInput['agents'];

type FormData = z.output<typeof formSchema>;

type FormInput = z.input<typeof formSchema>;

const getName = (key: string): string => key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (item) => item.toUpperCase());

const getReasoningEffort = (effort: null | string | undefined): null | ReasoningEffort => {
    if (!effort) {
        return null;
    }

    switch (effort.toLowerCase()) {
        case 'high': {
            return ReasoningEffort.High;
        }

        case 'low': {
            return ReasoningEffort.Low;
        }

        case 'max': {
            return ReasoningEffort.Max;
        }

        case 'medium': {
            return ReasoningEffort.Medium;
        }

        case 'xhigh': {
            return ReasoningEffort.Xhigh;
        }

        default: {
            return null;
        }
    }
};

const getReasoningMode = (mode: null | string | undefined): null | ReasoningMode => {
    switch (mode) {
        case ReasoningMode.Adaptive: {
            return ReasoningMode.Adaptive;
        }

        case ReasoningMode.Budget: {
            return ReasoningMode.Budget;
        }

        default: {
            return null;
        }
    }
};

const reasoningEffortLabel: Record<ReasoningEffort, string> = {
    [ReasoningEffort.High]: 'High',
    [ReasoningEffort.Low]: 'Low',
    [ReasoningEffort.Max]: 'Max',
    [ReasoningEffort.Medium]: 'Medium',
    [ReasoningEffort.Xhigh]: 'Extra High',
};

const defaultReasoningEfforts: ReasoningEffort[] = [ReasoningEffort.Low, ReasoningEffort.Medium, ReasoningEffort.High];

// ReasoningFields renders the per-agent reasoning controls, gated by the selected
// model's declared capability (models.yml) instead of a model-name allowlist:
// adaptive-only models lock to adaptive, and the effort options follow the model.
function ReasoningFields({
    agentKey,
    control,
    isLoading,
    models,
}: {
    agentKey: string;
    control: Control<FormInput>;
    isLoading: boolean;
    models: ModelOption[];
}) {
    const selectedModel = useWatch({ control, name: `agents.${agentKey}.model` });
    const capability = models.find((model) => model.name === selectedModel)?.reasoning ?? null;
    const isAdaptiveOnly = capability?.mode === ModelReasoningMode.AdaptiveOnly;
    const supportsAdaptive = isAdaptiveOnly || capability?.mode === ModelReasoningMode.Adaptive;
    const allowedEfforts =
        capability?.efforts && capability.efforts.length > 0 ? capability.efforts : defaultReasoningEfforts;

    return (
        <div className="col-span-full p-px">
            <div className="mt-6 flex flex-col gap-4">
                <h4 className="text-sm font-medium">Reasoning Configuration</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {supportsAdaptive && (
                        <FormField
                            control={control}
                            name={`agents.${agentKey}.reasoning.mode`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reasoning Mode</FormLabel>
                                    <Select
                                        defaultValue={field.value ?? (isAdaptiveOnly ? ReasoningMode.Adaptive : 'none')}
                                        disabled={isLoading || isAdaptiveOnly}
                                        onValueChange={(value) => field.onChange(value !== 'none' ? value : null)}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select reasoning mode" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {!isAdaptiveOnly && <SelectItem value="none">Not selected</SelectItem>}
                                            <SelectItem value={ReasoningMode.Adaptive}>Adaptive</SelectItem>
                                            {!isAdaptiveOnly && (
                                                <SelectItem value={ReasoningMode.Budget}>Budget</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {isAdaptiveOnly
                                            ? 'This model supports only adaptive thinking.'
                                            : 'Adaptive lets the model decide how much to think; budget uses a fixed token budget.'}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

                    <FormField
                        control={control}
                        name={`agents.${agentKey}.reasoning.effort`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reasoning Effort</FormLabel>
                                <Select
                                    defaultValue={field.value ?? 'none'}
                                    disabled={isLoading}
                                    onValueChange={(value) => field.onChange(value !== 'none' ? value : null)}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select effort level (optional)" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">Not selected</SelectItem>
                                        {allowedEfforts.map((effort) => (
                                            <SelectItem
                                                key={effort}
                                                value={effort}
                                            >
                                                {reasoningEffortLabel[effort]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormInputNumberItem
                        control={control}
                        disabled={isLoading}
                        label="Reasoning Max Tokens"
                        min="1"
                        name={`agents.${agentKey}.reasoning.maxTokens`}
                        placeholder="1000"
                        valueType="integer"
                    />
                </div>
            </div>
        </div>
    );
}

const transformFormToGraphQL = (
    formData: FormInput,
): {
    agents: AgentsConfigInput;
    name: string;
    type: ProviderType;
} => {
    const agents = Object.entries(formData.agents || {})
        .filter(([key, data]) => key !== '__typename' && data?.model)
        .reduce((configs, [key, data]) => {
            const config: AgentConfigInput = {
                frequencyPenalty: data?.frequencyPenalty ?? null,
                maxLength: data?.maxLength ?? null,
                maxTokens: data?.maxTokens ?? null,
                minLength: data?.minLength ?? null,
                model: data?.model ?? '',
                presencePenalty: data?.presencePenalty ?? null,
                price:
                    data?.price &&
                    typeof data?.price.input === 'number' &&
                    typeof data?.price.output === 'number' &&
                    typeof data?.price.cacheRead === 'number' &&
                    typeof data?.price.cacheWrite === 'number'
                        ? {
                              cacheRead: data.price.cacheRead,
                              cacheWrite: data.price.cacheWrite,
                              input: data.price.input,
                              output: data.price.output,
                          }
                        : null,
                reasoning: data?.reasoning
                    ? {
                          effort: getReasoningEffort(data?.reasoning.effort),
                          maxTokens: data?.reasoning.maxTokens ?? null,
                          mode: getReasoningMode(data?.reasoning.mode),
                      }
                    : null,
                repetitionPenalty: data?.repetitionPenalty ?? null,
                temperature: data?.temperature ?? null,
                topK: data?.topK ?? null,
                topP: data?.topP ?? null,
            };

            return { ...configs, [key]: config };
        }, {} as AgentsConfigInput);

    return {
        agents,
        name: formData.name ?? '',
        type: z.nativeEnum(ProviderType).parse(formData.type),
    };
};

const normalizeGraphQLData = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(normalizeGraphQLData);
    }

    if (typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([key]) => key !== '__typename')
                .map(([key, value]) => [key, normalizeGraphQLData(value)]),
        );
    }

    return obj;
};

interface TestResultsDialogProps {
    handleOpenChange: (isOpen: boolean) => void;
    isOpen: boolean;
    results: null | ProviderTestResults;
}

function TestResultsDialog({ handleOpenChange, isOpen, results }: TestResultsDialogProps) {
    if (!results) {
        return null;
    }

    const agentResults = Object.entries(results)
        .filter(([key]) => key !== '__typename')
        .map(([agentType, agentData]) => ({
            agentType,
            tests: agentData?.tests || [],
        }));

    const getStatusIcon = (result: boolean | null | undefined) => {
        if (result === true) {
            return <CheckCircle className="size-4 text-green-500" />;
        } else if (result === false) {
            return <XCircle className="size-4 text-red-500" />;
        } else {
            return <Clock className="size-4 text-yellow-500" />;
        }
    };

    const getStatusColor = (result: boolean | null | undefined) => {
        if (result === true) {
            return 'text-green-600';
        } else if (result === false) {
            return 'text-red-600';
        } else {
            return 'text-yellow-600';
        }
    };

    return (
        <Dialog
            onOpenChange={handleOpenChange}
            open={isOpen}
        >
            <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Provider Test Results</DialogTitle>
                </DialogHeader>
                <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
                    <Accordion
                        className="w-full"
                        type="multiple"
                    >
                        {agentResults.map(({ agentType, tests }) => {
                            const testsCount = tests.length;
                            const successTestsCount = tests.filter((test) => test.result === true).length;

                            return (
                                <AccordionItem
                                    key={agentType}
                                    value={agentType}
                                >
                                    <AccordionTrigger className="text-left">
                                        <div className="mr-4 flex w-full items-center justify-between">
                                            <span className="text-lg font-semibold capitalize">{agentType}</span>
                                            <span className="text-muted-foreground text-sm">
                                                {successTestsCount}/{testsCount} tests passed
                                            </span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="flex flex-col gap-3 pt-2">
                                            {tests.map((test, index) => (
                                                <div
                                                    className="rounded-lg border p-3"
                                                    key={index}
                                                >
                                                    <div className="mb-2 flex items-start justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {getStatusIcon(test.result)}
                                                            <span className="font-medium">{test.name}</span>
                                                            {test.type && (
                                                                <span className="text-muted-foreground text-sm">
                                                                    ({test.type})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-muted-foreground flex items-center gap-3 text-sm">
                                                            {test.reasoning !== undefined && (
                                                                <span>Reasoning: {test.reasoning ? 'Yes' : 'No'}</span>
                                                            )}
                                                            {test.streaming !== undefined && (
                                                                <span>Streaming: {test.streaming ? 'Yes' : 'No'}</span>
                                                            )}
                                                            {test.latency && <span>Latency: {test.latency}ms</span>}
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={`text-sm font-medium ${getStatusColor(test.result)}`}
                                                    >
                                                        Result:{' '}
                                                        {test.result === true
                                                            ? 'Success'
                                                            : test.result === false
                                                              ? 'Failed'
                                                              : 'Unknown'}
                                                    </div>
                                                    {test.error && (
                                                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                                                            <strong>Error:</strong> {test.error}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {tests.length === 0 && (
                                                <div className="text-muted-foreground py-4 text-center">
                                                    No tests available for this agent
                                                </div>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const agentTypesMap: Record<string, AgentConfigType> = {
    adviser: AgentConfigType.Adviser,
    assistant: AgentConfigType.Assistant,
    coder: AgentConfigType.Coder,
    enricher: AgentConfigType.Enricher,
    generator: AgentConfigType.Generator,
    installer: AgentConfigType.Installer,
    pentester: AgentConfigType.Pentester,
    primaryAgent: AgentConfigType.PrimaryAgent,
    refiner: AgentConfigType.Refiner,
    reflector: AgentConfigType.Reflector,
    searcher: AgentConfigType.Searcher,
    simple: AgentConfigType.Simple,
    simpleJson: AgentConfigType.SimpleJson,
};

const extractAgentTypes = (agents: unknown): null | string[] => {
    if (!agents || typeof agents !== 'object') {
        return null;
    }

    const types = Object.entries(agents)
        .filter(([key, data]) => key !== '__typename' && data)
        .map(([key]) => key)
        .sort();

    return types.length > 0 ? types : null;
};

function SettingsProvider() {
    const { providerId } = useParams<{ providerId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data, error, loading } = useQuery(SettingsProvidersDocument);
    const [createProvider, { error: createError, loading: isCreateLoading }] = useMutation(CreateProviderDocument);
    const [updateProvider, { error: updateError, loading: isUpdateLoading }] = useMutation(UpdateProviderDocument);
    const [deleteProvider, { error: deleteError, loading: isDeleteLoading }] = useMutation(DeleteProviderDocument);
    const [testProvider, { error: testError, loading: isTestLoading }] = useMutation(TestProviderDocument);
    const [testAgent, { error: agentTestError, loading: isAgentTestLoading }] = useMutation(TestAgentDocument);
    const [currentAgentKey, setCurrentAgentKey] = useState<null | string>(null);
    const [submitError, setSubmitError] = useState<null | string>(null);
    const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
    const [testResults, setTestResults] = useState<null | ProviderTestResults>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [pendingBrowserBack, setPendingBrowserBack] = useState(false);
    const allowBrowserLeaveRef = useRef(false);
    const hasPushedBlockerStateRef = useRef(false);

    const isNew = providerId === 'new';
    const isLoading = isCreateLoading || isUpdateLoading || isDeleteLoading;

    const form = useForm<FormInput, unknown, FormData>({
        defaultValues: {
            agents: {},
            name: undefined,
            type: undefined,
        },
        resolver: zodResolver(formSchema),
    });

    const { control, formState, handleSubmit: handleFormSubmit, reset, setValue, trigger, watch } = form;

    const { isDirty } = useFormState({ control });

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
            // Restore the blocker entry so the user stays on the page until they confirm.
            window.history.forward();
        };

        window.addEventListener('popstate', handlePopState, { capture: true });

        return () => {
            window.removeEventListener('popstate', handlePopState, { capture: true });
        };
    }, [isDirty]);

    const selectedType = useWatch({ control, name: 'type' });

    const providerName = useWatch({ control, name: 'name' });

    const formQueryParams = useMemo(
        () => ({
            id: searchParams.get('id'),
            type: searchParams.get('type'),
        }),
        [searchParams],
    );

    const getAgentTypes = () => {
        const agentsSource =
            (isNew &&
                selectedType &&
                data?.settingsProviders?.default?.[selectedType as keyof typeof data.settingsProviders.default]
                    ?.agents) ||
            (!isNew &&
                providerId &&
                data?.settingsProviders?.userDefined?.find((p: Provider) => p.id == providerId)?.agents) ||
            (data?.settingsProviders?.default &&
                Object.values(data.settingsProviders.default).find((provider) => provider?.agents)?.agents) ||
            null;

        return extractAgentTypes(agentsSource) ?? Object.keys(agentTypesMap);
    };

    const agentTypes = getAgentTypes();

    const availableModels = useMemo(() => {
        if (!data?.settingsProviders?.models || !selectedType) {
            return [];
        }

        const { models } = data.settingsProviders;
        const providerModels = models[selectedType as keyof typeof models];

        if (!providerModels?.length) {
            return [];
        }

        return providerModels
            .map((model) => ({
                name: model.name,
                price: model.price
                    ? {
                          cacheRead: model.price.cacheRead ?? 0,
                          cacheWrite: model.price.cacheWrite ?? 0,
                          input: model.price.input ?? 0,
                          output: model.price.output ?? 0,
                      }
                    : null,
                reasoning: model.reasoning ?? null,
                thinking: model.thinking,
            }))
            .filter((model) => model.name)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data, selectedType]);

    useEffect(() => {
        if (!isNew || !selectedType || !data?.settingsProviders?.default || availableModels.length === 0) {
            return;
        }

        const defaultProvider =
            data.settingsProviders.default[selectedType as keyof typeof data.settingsProviders.default];

        if (defaultProvider?.agents) {
            const agents = Object.fromEntries(
                Object.entries(defaultProvider.agents)
                    .filter(([key]) => key !== '__typename')
                    .map(([key, data]) => {
                        const agent = { ...data };

                        if (agent.model && !availableModels.find((m) => m.name === agent.model)) {
                            agent.model = availableModels[0]?.name || agent.model;
                        }

                        return [key, agent];
                    }),
            );

            setValue('agents', normalizeGraphQLData(agents) as FormAgents);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableModels, data, isNew, selectedType]);

    useEffect(() => {
        if (!isNew) {
            if (searchParams.size > 0) {
                setSearchParams({});
            }

            return;
        }

        const queryId = searchParams.get('id');

        if (queryId) {
            return;
        }

        const queryType = searchParams.get('type');

        if (!selectedType && queryType) {
            return;
        }

        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);

            if (selectedType) {
                params.set('type', selectedType);
            } else {
                params.delete('type');
            }

            return params;
        });
    }, [selectedType, setSearchParams, isNew, searchParams]);

    useEffect(() => {
        if (!data?.settingsProviders) {
            return;
        }

        const providers = data.settingsProviders;

        if (isNew || !providerId) {
            const queryType = formQueryParams.type ?? undefined;
            const queryId = formQueryParams.id;

            if (queryId && data?.settingsProviders?.userDefined) {
                const sourceProvider = data.settingsProviders.userDefined.find((p: Provider) => p.id == queryId);

                if (sourceProvider) {
                    const { agents, name, type: sourceType } = sourceProvider;

                    reset({
                        agents: agents ? (normalizeGraphQLData(agents) as FormAgents) : {},
                        name: `${name} (Copy)`,
                        type: sourceType ?? undefined,
                    });

                    return;
                }
            } else if (queryType && data?.settingsProviders?.default) {
                const defaultProvider =
                    data.settingsProviders.default[queryType as keyof typeof data.settingsProviders.default];

                reset({
                    agents: defaultProvider?.agents ? (normalizeGraphQLData(defaultProvider.agents) as FormAgents) : {},
                    name: undefined,
                    type: queryType,
                });
            }

            // Bail out of the empty-form reset when `selectedType` is set — the agent-filling
            // effect above is the source of truth in that case and would fight us.
            if (!selectedType) {
                reset({
                    agents: {},
                    name: undefined,
                    type: queryType,
                });
            }

            return;
        }

        const provider = providers.userDefined?.find((provider: Provider) => provider.id == providerId);

        if (!provider) {
            navigate(routes.settings.providers);

            return;
        }

        const { agents, name, type } = provider;

        reset({
            agents: agents ? (normalizeGraphQLData(agents) as FormAgents) : {},
            name: name || undefined,
            type: type || undefined,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, formQueryParams, isNew, providerId, selectedType]);

    const handleSubmit = async () => {
        // watch() — not getValues() — because disabled fields must be included in the payload.
        const formData = watch();

        try {
            setSubmitError(null);

            const mutationData = transformFormToGraphQL(formData);

            if (isNew) {
                await createProvider({
                    refetchQueries: ['settingsProviders'],
                    variables: mutationData,
                });
            } else {
                await updateProvider({
                    refetchQueries: ['settingsProviders'],
                    variables: {
                        ...mutationData,
                        providerId: providerId!,
                    },
                });
            }

            navigate(routes.settings.providers);
        } catch (error) {
            console.error('Submit error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while saving');
        }
    };

    const handleDelete = () => {
        if (isNew || !providerId) {
            return;
        }

        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (isNew || !providerId) {
            return;
        }

        try {
            setSubmitError(null);

            await deleteProvider({
                refetchQueries: ['settingsProviders'],
                variables: { providerId },
            });

            navigate(routes.settings.providers);
        } catch (error) {
            console.error('Delete error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while deleting');
        }
    };

    const handleTest = async () => {
        const isValid = await trigger();

        if (!isValid) {
            setSubmitError(
                `Please fix the following validation errors:\n\n${formatFormErrors(formState.errors as Record<string, unknown>)}`,
            );

            return;
        }

        try {
            setSubmitError(null);

            const formData = watch();
            const { agents, type } = transformFormToGraphQL(formData);
            const result = await testProvider({
                variables: {
                    agents,
                    type,
                },
            });

            setTestResults((result.data?.testProvider ?? null) as null | ProviderTestResults);
            setIsTestDialogOpen(true);
        } catch (error) {
            console.error('Test error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while testing');
        }
    };

    const handleTestAgent = async (agentKey: string) => {
        const isValid = await trigger();

        if (!isValid) {
            setSubmitError(
                `Please fix the following validation errors:\n\n${formatFormErrors(formState.errors as Record<string, unknown>)}`,
            );

            return;
        }

        try {
            setSubmitError(null);
            setCurrentAgentKey(agentKey);
            // watch() — not getValues() — because disabled fields must be included in the payload.
            const formData = watch();
            const { agents, type } = transformFormToGraphQL(formData);

            const agent = agents[agentKey as keyof AgentsConfigInput] as AgentConfigInput;

            const singleResult = await testAgent({
                variables: { agent, agentType: agentTypesMap[agentKey] ?? AgentConfigType.Simple, type },
            });
            setTestResults({ [agentKey]: singleResult.data?.testAgent } as ProviderTestResults);
            setIsTestDialogOpen(true);
            setCurrentAgentKey(null);

            return;
        } catch (error) {
            console.error('Test error:', error);
            setSubmitError(error instanceof Error ? error.message : 'An error occurred while testing');
            setCurrentAgentKey(null);
        }
    };

    const handleBack = () => {
        if (isDirty) {
            setIsLeaveDialogOpen(true);

            return;
        }

        navigate(routes.settings.providers);
    };

    const handleConfirmLeave = () => {
        if (pendingBrowserBack) {
            allowBrowserLeaveRef.current = true;
            setPendingBrowserBack(false);
            // Step over the synthetic blocker entry into the actual previous page.
            window.history.go(-2);

            return;
        }

        navigate(routes.settings.providers);
    };

    const handleLeaveDialogOpenChange = (open: boolean) => {
        if (!open && pendingBrowserBack) {
            setPendingBrowserBack(false);
        }

        setIsLeaveDialogOpen(open);
    };

    if (loading) {
        return (
            <StatusCard
                description="Please wait while we fetch provider configuration"
                icon={<Loader2 className="text-muted-foreground size-16 animate-spin" />}
                title="Loading provider data..."
            />
        );
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Error loading provider data</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
            </Alert>
        );
    }

    const providers = data?.settingsProviders?.models
        ? Object.keys(data?.settingsProviders.models).filter((key) => key !== '__typename')
        : [];

    const mutationError = createError || updateError || deleteError || testError || agentTestError || submitError;

    return (
        <>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <Cpu className="text-muted-foreground size-5" />
                        {isNew ? 'New Provider' : 'Provider Settings'}
                    </h2>

                    <div className="text-muted-foreground">
                        {isNew
                            ? 'Configure a new language model provider'
                            : 'Update provider settings and configuration'}
                    </div>
                </div>

                <Form {...form}>
                    <form
                        className="flex flex-col gap-6"
                        id="provider-form"
                        onSubmit={handleFormSubmit(handleSubmit)}
                    >
                        {/* Error Alert */}
                        {mutationError && (
                            <Alert variant="destructive">
                                <AlertCircle className="size-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>
                                    {typeof mutationError === 'string' ? (
                                        <div className="whitespace-pre-line">{mutationError}</div>
                                    ) : (
                                        mutationError.message
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Form fields */}
                        <FormComboboxItem
                            allowCustom={false}
                            control={control}
                            description="The type of language model provider"
                            disabled={isLoading || !!selectedType}
                            label="Type"
                            name="type"
                            options={providers}
                            placeholder="Select provider"
                        />

                        <FormInputStringItem
                            control={control}
                            description="A unique name for your provider configuration"
                            disabled={isLoading}
                            label="Name"
                            name="name"
                            placeholder="Enter provider name"
                        />

                        {/* Agents Configuration Section */}
                        <div className="flex flex-col gap-4">
                            <div>
                                <h3 className="text-lg font-medium">Agent Configurations</h3>
                                <p className="text-muted-foreground text-sm">Configure settings for each agent type</p>
                            </div>

                            <Accordion
                                className="w-full"
                                type="multiple"
                            >
                                {agentTypes.map((agentKey) => (
                                    <AccordionItem
                                        key={agentKey}
                                        value={agentKey}
                                    >
                                        <AccordionTrigger className="group text-left hover:no-underline">
                                            <div className="flex w-full items-center justify-between gap-2">
                                                <span className="group-hover:underline">{getName(agentKey)}</span>
                                                <span
                                                    className={cn(
                                                        'hover:bg-accent hover:text-accent-foreground mr-2 flex items-center gap-1 rounded border px-2 py-1 text-xs',
                                                        (isTestLoading || isAgentTestLoading) &&
                                                            'pointer-events-none cursor-not-allowed opacity-50',
                                                    )}
                                                    onClick={(event) => {
                                                        if (isTestLoading || isAgentTestLoading) {
                                                            return;
                                                        }

                                                        event.stopPropagation();
                                                        handleTestAgent(agentKey);
                                                    }}
                                                >
                                                    {isAgentTestLoading && currentAgentKey === agentKey ? (
                                                        <Loader2 className="size-4 animate-spin" />
                                                    ) : (
                                                        <Play className="size-4" />
                                                    )}
                                                    <span className="no-underline! hover:no-underline!">
                                                        {isAgentTestLoading && currentAgentKey === agentKey
                                                            ? 'Testing...'
                                                            : 'Test'}
                                                    </span>
                                                </span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="flex flex-col gap-4 pt-4">
                                            <div className="grid grid-cols-1 gap-4 p-px md:grid-cols-2">
                                                {/* Model field */}
                                                <FormModelComboboxItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Model"
                                                    name={`agents.${agentKey}.model`}
                                                    onOptionSelect={(option) => {
                                                        {
                                                            /* Update price fields */
                                                        }

                                                        const price = option?.price;

                                                        setValue(
                                                            `agents.${agentKey}.price.input` as const,
                                                            price?.input ?? null,
                                                        );
                                                        setValue(
                                                            `agents.${agentKey}.price.output` as const,
                                                            price?.output ?? null,
                                                        );
                                                        setValue(
                                                            `agents.${agentKey}.price.cacheRead` as const,
                                                            price?.cacheRead ?? null,
                                                        );
                                                        setValue(
                                                            `agents.${agentKey}.price.cacheWrite` as const,
                                                            price?.cacheWrite ?? null,
                                                        );

                                                        // Reset reasoning on model change: adaptive-only models lock
                                                        // to adaptive, others clear the now-stale mode/effort.
                                                        setValue(
                                                            `agents.${agentKey}.reasoning.mode` as const,
                                                            option?.reasoning?.mode === ModelReasoningMode.AdaptiveOnly
                                                                ? ReasoningMode.Adaptive
                                                                : null,
                                                        );
                                                        setValue(`agents.${agentKey}.reasoning.effort` as const, null);
                                                    }}
                                                    options={availableModels}
                                                    placeholder="Select or enter model name"
                                                />

                                                {/* Temperature field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Temperature"
                                                    max="2"
                                                    min="0"
                                                    name={`agents.${agentKey}.temperature`}
                                                    placeholder="0.7"
                                                    step="0.1"
                                                />

                                                {/* Max Tokens field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Max Tokens"
                                                    min="1"
                                                    name={`agents.${agentKey}.maxTokens`}
                                                    placeholder="1000"
                                                    valueType="integer"
                                                />

                                                {/* Top P field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Top P"
                                                    max="1"
                                                    min="0"
                                                    name={`agents.${agentKey}.topP`}
                                                    placeholder="0.9"
                                                    step="0.01"
                                                />

                                                {/* Top K field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Top K"
                                                    min="1"
                                                    name={`agents.${agentKey}.topK`}
                                                    placeholder="40"
                                                    valueType="integer"
                                                />

                                                {/* Min Length field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Min Length"
                                                    min="0"
                                                    name={`agents.${agentKey}.minLength`}
                                                    placeholder="0"
                                                    valueType="integer"
                                                />

                                                {/* Max Length field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Max Length"
                                                    min="1"
                                                    name={`agents.${agentKey}.maxLength`}
                                                    placeholder="2000"
                                                    valueType="integer"
                                                />

                                                {/* Repetition Penalty field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Repetition Penalty"
                                                    max="2"
                                                    min="0"
                                                    name={`agents.${agentKey}.repetitionPenalty`}
                                                    placeholder="1.0"
                                                    step="0.01"
                                                />

                                                {/* Frequency Penalty field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Frequency Penalty"
                                                    max="2"
                                                    min="0"
                                                    name={`agents.${agentKey}.frequencyPenalty`}
                                                    placeholder="0.0"
                                                    step="0.01"
                                                />

                                                {/* Presence Penalty field */}
                                                <FormInputNumberItem
                                                    control={control}
                                                    disabled={isLoading}
                                                    label="Presence Penalty"
                                                    max="2"
                                                    min="0"
                                                    name={`agents.${agentKey}.presencePenalty`}
                                                    placeholder="0.0"
                                                    step="0.01"
                                                />
                                            </div>

                                            <ReasoningFields
                                                agentKey={agentKey}
                                                control={control}
                                                isLoading={isLoading}
                                                models={availableModels}
                                            />

                                            {/* Price Configuration */}
                                            <div className="col-span-full p-px">
                                                <div className="mt-6 flex flex-col gap-4">
                                                    <h4 className="text-sm font-medium">Price Configuration</h4>
                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        {/* Price Input field */}
                                                        <FormInputNumberItem
                                                            control={control}
                                                            description="Price per 1M input tokens"
                                                            disabled={isLoading}
                                                            label="Input Price"
                                                            min="0"
                                                            name={`agents.${agentKey}.price.input`}
                                                            placeholder="0.001"
                                                            step="0.000001"
                                                        />

                                                        {/* Price Output field */}
                                                        <FormInputNumberItem
                                                            control={control}
                                                            description="Price per 1M output tokens"
                                                            disabled={isLoading}
                                                            label="Output Price"
                                                            min="0"
                                                            name={`agents.${agentKey}.price.output`}
                                                            placeholder="0.002"
                                                            step="0.000001"
                                                        />

                                                        {/* Cache Read Price field */}
                                                        <FormInputNumberItem
                                                            control={control}
                                                            description="Price per 1M cached read tokens"
                                                            disabled={isLoading}
                                                            label="Cache Read Price"
                                                            min="0"
                                                            name={`agents.${agentKey}.price.cacheRead`}
                                                            placeholder="0.0001"
                                                            step="0.000001"
                                                        />

                                                        {/* Cache Write Price field */}
                                                        <FormInputNumberItem
                                                            control={control}
                                                            description="Price per 1M cache write tokens"
                                                            disabled={isLoading}
                                                            label="Cache Write Price"
                                                            min="0"
                                                            name={`agents.${agentKey}.price.cacheWrite`}
                                                            placeholder="0.00015"
                                                            step="0.000001"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    </form>
                </Form>
            </div>

            {/* Sticky buttons at bottom */}
            <div className="bg-background sticky -bottom-4 -mx-4 mt-4 -mb-4 flex items-center border-t p-4 shadow-lg">
                <div className="flex gap-2">
                    {/* Delete button - only show when editing existing provider */}
                    {!isNew && (
                        <Button
                            disabled={isLoading}
                            onClick={handleDelete}
                            type="button"
                            variant="destructive"
                        >
                            {isDeleteLoading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Trash2 className="size-4" />
                            )}
                            {isDeleteLoading ? 'Deleting...' : 'Delete'}
                        </Button>
                    )}
                    <Button
                        disabled={isLoading || isTestLoading || isAgentTestLoading}
                        onClick={() => handleTest()}
                        type="button"
                        variant="outline"
                    >
                        {isTestLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                        {isTestLoading ? 'Testing...' : 'Test'}
                    </Button>
                </div>

                <div className="ml-auto flex gap-2">
                    <Button
                        disabled={isLoading}
                        onClick={handleBack}
                        type="button"
                        variant="outline"
                    >
                        Cancel
                    </Button>
                    <FormSubmitButton
                        form="provider-form"
                        icon={<Save className="size-4" />}
                        loading={isLoading}
                        variant="secondary"
                    >
                        {isLoading ? 'Saving...' : isNew ? 'Create Provider' : 'Update Provider'}
                    </FormSubmitButton>
                </div>
            </div>

            <TestResultsDialog
                handleOpenChange={setIsTestDialogOpen}
                isOpen={isTestDialogOpen}
                results={testResults}
            />

            <ConfirmationDialog
                cancelText="Cancel"
                confirmText="Delete"
                handleConfirm={handleConfirmDelete}
                handleOpenChange={setIsDeleteDialogOpen}
                isOpen={isDeleteDialogOpen}
                itemName={providerName}
                itemType="provider"
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
        </>
    );
}

export default SettingsProvider;
