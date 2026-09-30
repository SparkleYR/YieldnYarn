"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { IconLeaf, IconMenu2, IconX } from "@tabler/icons-react";

import { NAV_LINKS, SITE_NAME } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-primary text-white">
            <IconLeaf size={20} stroke={2.2} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-heading">{SITE_NAME}</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-[0.9375rem] font-semibold transition-colors hover:bg-muted hover:text-heading",
                pathname === link.href ? "text-heading" : "text-body"
              )}
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher compact className="hidden sm:flex" />
          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link href="/login">{t("site.nav.login")}</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/register">{t("site.nav.start")}</Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("site.nav.menu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconX /> : <IconMenu2 />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-card lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-heading hover:bg-muted"
              >
                {t(link.labelKey)}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="lg">
                <Link href="/login">{t("site.nav.login")}</Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/register">{t("site.nav.start")}</Link>
              </Button>
            </div>
            <LanguageSwitcher className="mt-3 w-fit" />
          </nav>
        </div>
      )}
    </header>
  );
}
