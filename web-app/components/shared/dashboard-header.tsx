"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconBell, IconLogout, IconUserCircle } from "@tabler/icons-react";

import type { User } from "@/lib/api";
import { logout as endSession } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import type { DashboardNavItem } from "@/components/shared/dashboard-nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(user: User) {
  const source = user.profile?.display_name || user.email;
  return source.slice(0, 2).toUpperCase();
}

/** Falls back to the current path's nav item label, or a title-cased last segment. */
function useSectionTitle(navItems: DashboardNavItem[]) {
  const pathname = usePathname();
  const t = useT();
  const match = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (match) return match.labelKey ? t(match.labelKey) : match.label;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard";
}

export function DashboardHeader({
  navItems,
  user,
}: {
  navItems: DashboardNavItem[];
  user: User;
}) {
  const router = useRouter();
  const t = useT();
  const title = useSectionTitle(navItems);
  // Only the buyer portal is translated; staff consoles don't get the switch.
  const translated = navItems.some((item) => item.labelKey);
  const dashboardHref = navItems[0]?.href ?? "/login";
  const notificationsHref = navItems.find((item) => item.href.endsWith("/notifications"))?.href;

  function handleLogout() {
    void endSession().then(() => router.push("/login"));
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-muted px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium text-heading">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {translated && <LanguageSwitcher className="hidden sm:flex" />}
        {notificationsHref && (
          <Link
            href={notificationsHref}
            className="flex size-8 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-muted hover:text-natural-white"
            aria-label={t("header.notifications")}
          >
            <IconBell size={17} />
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar size="sm">
                <AvatarFallback>{initials(user)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">
              {user.profile?.display_name || user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={dashboardHref}>
                <IconUserCircle />
                {t("header.profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
              <IconLogout />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
