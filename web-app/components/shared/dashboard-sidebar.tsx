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
        <Link href="/" className="flex h-12 items-center gap-2.5 px-1.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white">
            <IconLeaf size={20} stroke={2.2} />
          </span>
          <span className="truncate text-lg font-extrabold tracking-tight text-heading group-data-[collapsible=icon]:hidden">
            {SITE_NAME}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
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
