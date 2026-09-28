"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLeaf } from "@tabler/icons-react";

import { useT } from "@/lib/i18n";
import { SITE_NAME } from "@/lib/constants";
import type { DashboardNavItem } from "@/components/shared/dashboard-nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function DashboardSidebar({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary-glow">
            <IconLeaf size={16} stroke={2} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-natural-white group-data-[collapsible=icon]:hidden">
            {SITE_NAME}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const label = item.labelKey ? t(item.labelKey) : item.label;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
