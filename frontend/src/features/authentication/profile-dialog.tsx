import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { EmailChangeForm } from './email-change-form';
import { PasswordChangeForm } from './password-change-form';

interface ProfileDialogProps {
    onCancel: () => void;
    onSuccess: () => void;
}

export function ProfileDialog({ onCancel, onSuccess }: ProfileDialogProps) {
    return (
        <Tabs
            className="w-full"
            defaultValue="email"
        >
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Update Email</TabsTrigger>
                <TabsTrigger value="password">Change Password</TabsTrigger>
            </TabsList>
            <TabsContent value="email">
                <div className="pt-2">
                    <EmailChangeForm
                        onCancel={onCancel}
                        onSuccess={onSuccess}
                    />
                </div>
            </TabsContent>
            <TabsContent value="password">
                <div className="pt-2">
                    <PasswordChangeForm
                        onCancel={onCancel}
                        onSuccess={onSuccess}
                    />
                </div>
            </TabsContent>
        </Tabs>
    );
}
