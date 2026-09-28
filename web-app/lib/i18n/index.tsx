"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { messages, type Locale, type MessageKey } from "./messages";

export type { Locale, MessageKey };
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

const STORAGE_KEY = "msme-locale";

type Vars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Locale for Intl formatting (numbers, dates): Indian digit grouping either way. */
  intlLocale: string;
}

function format(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

function translate(locale: Locale, key: MessageKey, vars?: Vars) {
  return format(messages[locale][key] ?? messages.en[key] ?? key, vars);
}

const I18nContext = createContext<I18nValue>({
  locale: "en",
  setLocale: () => {},
  t: (key, vars) => translate("en", key, vars),
  intlLocale: "en-IN",
});

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

// The locale lives in localStorage, read through useSyncExternalStore: the
// server (and the first client render) use English, then React switches to
// the stored choice without a setState-in-effect round trip. Other tabs pick
// up a change through the `storage` event.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Client-side English/Hindi switch for the buyer-facing app. Every route stays
 * statically renderable (the server always renders English); Hindi readers
 * see the page switch right after hydration.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readStoredLocale, () => "en" as Locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode etc.: the choice just won't persist.
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      intlLocale: locale === "hi" ? "hi-IN" : "en-IN",
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
