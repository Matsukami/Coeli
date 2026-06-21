import type { ReactNode } from 'react';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface SettingsPageHeaderProps {
    actions?: ReactNode;
    icon?: ReactNode;
    title: ReactNode;
}

export function SettingsPageHeader({ actions, icon, title }: SettingsPageHeaderProps) {
    return (
        <header className="bg-background sticky top-0 z-10 flex h-12 w-full shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1 shrink-0" />
                <Separator
                    className="h-4 shrink-0"
                    orientation="vertical"
                />
                <Breadcrumb className="min-w-0 flex-1">
                    <BreadcrumbList className="min-w-0 flex-nowrap">
                        <BreadcrumbItem className="min-w-0 gap-2">
                            {icon}
                            <BreadcrumbPage className="min-w-0 truncate">{title}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2 px-4">{actions}</div> : null}
        </header>
    );
}
