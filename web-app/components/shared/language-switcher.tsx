"use client";

import { IconLanguage } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { LOCALES, useI18n } from "@/lib/i18n";

/** English / हिन्दी toggle; the choice is remembered in this browser. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn("flex items-center gap-1 rounded-lg border border-border-muted p-0.5 text-xs", className)}
    >
      <IconLanguage size={14} className="ml-1 text-muted-2" aria-hidden />
      {LOCALES.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLocale(option.code)}
          aria-pressed={locale === option.code}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            locale === option.code ? "bg-muted text-heading" : "text-muted-2 hover:text-heading"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
