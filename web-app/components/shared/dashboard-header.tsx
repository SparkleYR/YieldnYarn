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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
      <SidebarTrigger className="size-10" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <p className="truncate text-base font-bold text-heading">{title}</p>

      <div className="ml-auto flex items-center gap-2">
        {translated && <LanguageSwitcher compact />}
        {notificationsHref && (
          <Link
            href={notificationsHref}
            className="flex size-10 items-center justify-center rounded-xl text-body transition-colors hover:bg-muted hover:text-heading"
            aria-label={t("header.notifications")}
          >
            <IconBell size={21} />
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar size="lg">
                <AvatarFallback className="bg-brand-primary-muted font-bold text-brand-primary-hover">{initials(user)}</AvatarFallback>
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
