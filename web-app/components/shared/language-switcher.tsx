"use client";

import { IconLanguage } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { LOCALES, useI18n } from "@/lib/i18n";

/** English / हिन्दी toggle; the choice is remembered in this browser. */
export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn("flex h-10 items-center gap-1 rounded-xl border border-border bg-card p-1 text-sm font-semibold", className)}
    >
      <IconLanguage size={18} className={cn("mx-1 text-muted-2", compact && "hidden sm:block")} aria-hidden />
      {LOCALES.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLocale(option.code)}
          aria-pressed={locale === option.code}
          className={cn(
            "h-full rounded-lg px-2.5 transition-colors",
            compact && "px-2 sm:px-2.5",
            locale === option.code ? "bg-brand-primary text-white" : "text-body hover:bg-muted hover:text-heading"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
