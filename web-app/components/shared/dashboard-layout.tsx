"use client";

import type { ReactNode } from "react";

import type { User } from "@/lib/api";
import type { DashboardNavItem } from "@/components/shared/dashboard-nav-items";
import { CommandPalette } from "@/components/shared/command-palette";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { DashboardHeader } from "@/components/shared/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function DashboardLayout({
  user,
  navItems,
  children,
}: {
  user: User;
  navItems: DashboardNavItem[];
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <CommandPalette navItems={navItems} />
      <DashboardSidebar items={navItems} />
      <SidebarInset>
        <DashboardHeader navItems={navItems} user={user} />
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
