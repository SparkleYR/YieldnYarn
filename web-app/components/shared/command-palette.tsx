"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconHome2, IconLogout } from "@tabler/icons-react";

import { clearSession } from "@/lib/auth";
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
    clearSession();
    router.push("/login");
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a page or run an action"
    >
      <CommandInput placeholder="Type a page name or command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {navItems.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
          <CommandItem value="Marketing site home" onSelect={() => go("/")}>
            <IconHome2 />
            Marketing site home
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem value="Log out" onSelect={logout}>
            <IconLogout />
            Log out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-end gap-1 border-t border-border-muted px-3 py-2 text-xs text-muted-2">
        <span>Toggle with</span>
        <CommandShortcut className="ml-0 rounded border border-border-muted px-1.5 py-0.5 font-mono">
          ⌘K
        </CommandShortcut>
      </div>
    </CommandDialog>
  );
}
