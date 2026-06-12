import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmailChangeForm } from '@/features/authentication/email-change-form';
import { PasswordChangeForm } from '@/features/authentication/password-change-form';
import { useUser } from '@/providers/user-provider';

type EditingSection = 'email' | 'password' | null;

function SettingsAccount() {
    const { authInfo } = useUser();
    const user = authInfo?.user;
    const [editing, setEditing] = useState<EditingSection>(null);

    if (user?.type !== 'local') {
        return (
            <Navigate
                replace
                to="/settings/providers"
            />
        );
    }

    const stopEditing = () => setEditing(null);

    const displayName = user.name?.trim() || user.mail;
    const initial = (displayName || '?').charAt(0).toUpperCase();
    const createdAt = user.created_at ? new Date(user.created_at) : null;
    const memberSince =
        createdAt && !Number.isNaN(createdAt.getTime()) ? format(createdAt, 'MMMM yyyy', { locale: enUS }) : null;

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
                    <Badge variant="secondary">Local account</Badge>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                    <div className="grid gap-1.5">
                        <CardTitle>Email address</CardTitle>
                        <CardDescription>The email you use to sign in.</CardDescription>
                    </div>
                    {editing !== 'email' && (
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
                    {editing === 'email' ? (
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
        </div>
    );
}

export default SettingsAccount;
