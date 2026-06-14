import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Lock, Mail, User } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmailChangeForm } from '@/features/authentication/email-change-form';
import { NameChangeForm } from '@/features/authentication/name-change-form';
import { PasswordChangeForm } from '@/features/authentication/password-change-form';
import { useUser } from '@/providers/user-provider';

type EditingSection = 'email' | 'name' | 'password' | null;

const PROVIDER_LABELS: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
};

function SettingsAccount() {
    const { authInfo } = useUser();
    const user = authInfo?.user;
    const [editing, setEditing] = useState<EditingSection>(null);

    if (!user) {
        return null;
    }

    const isLocal = user.type === 'local';
    const stopEditing = () => setEditing(null);

    const displayName = user.name?.trim() || user.mail;
    const initial = ([...(displayName || '?')][0] ?? '?').toUpperCase();
    const createdAt = user.created_at ? new Date(user.created_at) : null;
    const memberSince =
        createdAt && !Number.isNaN(createdAt.getTime()) ? format(createdAt, 'MMMM yyyy', { locale: enUS }) : null;
    const accountLabel = isLocal
        ? 'Local account'
        : user.provider
          ? (PROVIDER_LABELS[user.provider] ?? user.provider)
          : 'OAuth account';

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <Card>
                <CardHeader className="flex-row items-center gap-4">
                    <div className="bg-muted text-foreground flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold">
                        {initial}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                        <CardTitle className="truncate">{displayName}</CardTitle>
                        {memberSince && <CardDescription>Member since {memberSince}</CardDescription>}
                    </div>
                    <Badge variant="secondary">{accountLabel}</Badge>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                    <div className="grid gap-1.5">
                        <CardTitle>Display name</CardTitle>
                        <CardDescription>The name shown across the app.</CardDescription>
                    </div>
                    {editing !== 'name' && (
                        <Button
                            onClick={() => setEditing('name')}
                            size="sm"
                            variant="outline"
                        >
                            Change
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {editing === 'name' ? (
                        <NameChangeForm
                            onCancel={stopEditing}
                            onSuccess={stopEditing}
                        />
                    ) : (
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <User className="size-4 shrink-0" />
                            <span className="truncate">{displayName}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                    <div className="grid gap-1.5">
                        <CardTitle>Email address</CardTitle>
                        <CardDescription>
                            {isLocal ? 'The email you use to sign in.' : `Linked from your ${accountLabel}.`}
                        </CardDescription>
                    </div>
                    {isLocal && editing !== 'email' && (
                        <Button
                            onClick={() => setEditing('email')}
                            size="sm"
                            variant="outline"
                        >
                            Change
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {isLocal && editing === 'email' ? (
                        <EmailChangeForm
                            onCancel={stopEditing}
                            onSuccess={stopEditing}
                        />
                    ) : (
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Mail className="size-4 shrink-0" />
                            <span className="truncate">{user.mail}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {isLocal && (
                <Card>
                    <CardHeader className="flex-row items-start justify-between gap-4">
                        <div className="grid gap-1.5">
                            <CardTitle>Password</CardTitle>
                            <CardDescription>Change your account password.</CardDescription>
                        </div>
                        {editing !== 'password' && (
                            <Button
                                onClick={() => setEditing('password')}
                                size="sm"
                                variant="outline"
                            >
                                Change
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        {editing === 'password' ? (
                            <PasswordChangeForm
                                buttonSize="sm"
                                onCancel={stopEditing}
                                onSuccess={stopEditing}
                            />
                        ) : (
                            <div className="text-muted-foreground flex items-center gap-2 text-sm">
                                <Lock className="size-4 shrink-0" />
                                <span>••••••••••••</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default SettingsAccount;
