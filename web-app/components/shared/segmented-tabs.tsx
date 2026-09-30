"use client";

import { cn } from "@/lib/utils";

/** Pill tabs with optional counts — the one tab style used across the app. */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:w-fit">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors",
              active ? "bg-brand-primary text-white shadow-sm" : "text-body hover:bg-muted hover:text-heading"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold",
                  active ? "bg-white/20 text-white" : "bg-muted text-heading"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
