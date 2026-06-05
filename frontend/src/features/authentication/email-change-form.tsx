import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
import { Input } from '@/components/ui/input';
import { api, type ApiErrorResponse, type ApiHttpError } from '@/lib/axios';
import { useUser } from '@/providers/user-provider';

const emailChangeSchema = z.object({
    currentPassword: z.string().min(1, { message: 'Current password is required' }),
    newEmail: z
        .string()
        .min(1, { message: 'Email is required' })
        .email({ message: 'Invalid email address' })
        .max(50, { message: 'Email must not exceed 50 characters' }),
});

interface EmailChangeFormProps {
    isModal?: boolean;
    onCancel?: () => void;
    onSuccess?: () => void;
}

type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;

export function EmailChangeForm({ isModal = true, onCancel, onSuccess }: EmailChangeFormProps) {
    const [error, setError] = useState<null | string>(null);
    const [showPassword, setShowPassword] = useState(false);
    const { authInfo, refreshAuthInfo } = useUser();
    const currentEmail = authInfo?.user?.mail || '';

    const form = useForm<EmailChangeFormValues>({
        defaultValues: {
            currentPassword: '',
            newEmail: '',
        },
        resolver: zodResolver(emailChangeSchema),
    });

    const handleSubmit = async (values: EmailChangeFormValues) => {
        setError(null);

        try {
            await api.put('/user/email', {
                current_password: values.currentPassword,
                mail: values.newEmail,
            });

            form.reset();
            setShowPassword(false);

            toast.success('Email successfully updated');

            // Refresh user info to update local state/display
            await refreshAuthInfo();

            if (onSuccess) {
                onSuccess();
            }
        } catch (err: unknown) {
            const error = err as ApiHttpError;
            const responseData = error.response?.data as ApiErrorResponse | undefined;

            let errorMessage = 'Failed to update email';

            if (responseData?.msg) {
                errorMessage = responseData.msg;
            } else if (responseData?.code) {
                switch (responseData.code) {
                    case 'AuthRequired':
                        errorMessage = 'Authentication required';
                        break;
                    case 'Users.ChangeEmailCurrentUser.EmailAlreadyExists':
                        errorMessage = 'Email address is already in use';
                        break;
                    case 'Users.ChangeEmailCurrentUser.InvalidCurrentPassword':
                        errorMessage = 'Current password is incorrect';
                        break;
                    case 'Users.ChangeEmailCurrentUser.InvalidEmail':
                        errorMessage = 'New email does not meet requirements';
                        break;
                    case 'Users.NotFound':
                        errorMessage = 'User not found';
                        break;
                    default:
                        errorMessage = responseData.msg || error.message || 'Failed to update email';
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        }
    };

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(handleSubmit)}
            >
                <div className="space-y-2">
                    <label className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Current Email
                    </label>
                    <Input
                        disabled
                        value={currentEmail}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="newEmail"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New Email</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Enter new email address"
                                    type="email"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Current Password</FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Input
                                        {...field}
                                        placeholder="Enter your current password to confirm"
                                        type={showPassword ? 'text' : 'password'}
                                    />
                                    <Button
                                        className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => setShowPassword(!showPassword)}
                                        size="sm"
                                        tabIndex={-1}
                                        type="button"
                                        variant="ghost"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="text-muted-foreground size-4" />
                                        ) : (
                                            <Eye className="text-muted-foreground size-4" />
                                        )}
                                    </Button>
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {error && <div className="text-destructive text-sm">{error}</div>}

                <div className="flex justify-end gap-2 pt-2">
                    {isModal && (
                        <Button
                            onClick={onCancel}
                            type="button"
                            variant="outline"
                        >
                            Cancel
                        </Button>
                    )}
                    <FormSubmitButton>
                        <span>Update Email</span>
                    </FormSubmitButton>
                </div>
            </form>
        </Form>
    );
}
