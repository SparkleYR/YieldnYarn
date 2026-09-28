"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconHome2, IconLogout } from "@tabler/icons-react";

import { logout as endSession } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { DashboardNavItem } from "@/components/shared/dashboard-nav-items";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

/** Global ⌘K/Ctrl+K palette — mounted once per dashboard layout (buyer/admin/verifier). */
export function CommandPalette({ navItems }: { navItems: DashboardNavItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function logout() {
    setOpen(false);
    void endSession().then(() => router.push("/login"));
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("palette.title")}
      description={t("palette.description")}
    >
      <CommandInput placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        <CommandGroup heading={t("palette.pages")}>
          {navItems.map((item) => {
            const label = item.labelKey ? t(item.labelKey) : item.label;
            return (
              <CommandItem key={item.href} value={label} onSelect={() => go(item.href)}>
                <item.icon />
                {label}
              </CommandItem>
            );
          })}
          <CommandItem value={t("palette.home")} onSelect={() => go("/")}>
            <IconHome2 />
            {t("palette.home")}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("palette.actions")}>
          <CommandItem value={t("palette.logout")} onSelect={logout}>
            <IconLogout />
            {t("palette.logout")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-end gap-1 border-t border-border-muted px-3 py-2 text-xs text-muted-2">
        <span>{t("palette.toggleWith")}</span>
        <CommandShortcut className="ml-0 rounded border border-border-muted px-1.5 py-0.5 font-mono">
          ⌘K
        </CommandShortcut>
      </div>
    </CommandDialog>
  );
}
