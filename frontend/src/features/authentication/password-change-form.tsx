import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
import { InputPassword } from '@/components/ui/input-password';
import { api, getApiErrorCode, getApiErrorMessage } from '@/lib/axios';

const passwordChangeSchema = z
    .object({
        confirmPassword: z.string().min(1, { message: 'Confirm your password' }),
        currentPassword: z.string().min(1, { message: 'Current password is required' }),
        newPassword: z
            .string()
            .min(8, { message: 'Password must be at least 8 characters' })
            .max(100, { message: 'Password must not exceed 100 characters' })
            .refine(
                (password) => {
                    if (password.length > 15) {
                        return true;
                    }

                    return (
                        password.length >= 8 &&
                        /[0-9]/.test(password) &&
                        /[a-z]/.test(password) &&
                        /[A-Z]/.test(password) &&
                        /[!@#$&*]/.test(password)
                    );
                },
                {
                    message:
                        'Password must be either longer than 15 characters, or at least 8 characters with a number, lowercase, uppercase, and special character (!@#$&*)',
                },
            ),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
        message: 'New password must be different from current password',
        path: ['newPassword'],
    });

const ERROR_BY_CODE: Record<string, string> = {
    AuthRequired: 'Authentication required',
    'Users.ChangePasswordCurrentUser.InvalidCurrentPassword': 'Current password is incorrect',
    'Users.ChangePasswordCurrentUser.InvalidNewPassword': 'New password does not meet requirements',
    'Users.ChangePasswordCurrentUser.InvalidPassword': 'Password validation failed',
    'Users.NotFound': 'User not found',
};

interface PasswordChangeFormProps {
    isModal?: boolean;
    onCancel?: () => void;
    onSkip?: () => void;
    onSuccess?: () => void;
    showSkip?: boolean;
}

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export function PasswordChangeForm({
    isModal = true,
    onCancel,
    onSkip,
    onSuccess,
    showSkip = false,
}: PasswordChangeFormProps) {
    const [error, setError] = useState<null | string>(null);

    const form = useForm<PasswordChangeFormValues>({
        defaultValues: {
            confirmPassword: '',
            currentPassword: '',
            newPassword: '',
        },
        resolver: zodResolver(passwordChangeSchema),
    });

    const handleSubmit = async (values: PasswordChangeFormValues) => {
        setError(null);

        try {
            await api.put('/user/password', {
                confirm_password: values.confirmPassword,
                current_password: values.currentPassword,
                password: values.newPassword,
            });

            form.reset();
            toast.success('Password successfully changed');

            onSuccess?.();
        } catch (err: unknown) {
            const code = getApiErrorCode(err);
            setError((code && ERROR_BY_CODE[code]) ?? getApiErrorMessage(err, 'Failed to change password'));
        }
    };

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(handleSubmit)}
            >
                <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Current Password</FormLabel>
                            <FormControl>
                                <InputPassword
                                    {...field}
                                    placeholder="Enter your current password"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                                <InputPassword
                                    {...field}
                                    placeholder="Enter your new password"
                                />
                            </FormControl>
                            <FormDescription className="text-xs">
                                Must be 16+ characters, or 8+ with number, lowercase, uppercase, and special character
                                (!@#$&*)
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm New Password</FormLabel>
                            <FormControl>
                                <InputPassword
                                    {...field}
                                    placeholder="Confirm your new password"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {error && <div className="text-destructive text-sm">{error}</div>}

                <div className="flex justify-end gap-2 pt-2">
                    {showSkip && (
                        <Button
                            className="text-muted-foreground"
                            onClick={onSkip}
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            Skip for now
                        </Button>
                    )}
                    {isModal && (
                        <Button
                            onClick={onCancel}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Cancel
                        </Button>
                    )}
                    <FormSubmitButton size="sm">
                        <span>Update Password</span>
                    </FormSubmitButton>
                </div>
            </form>
        </Form>
    );
}
