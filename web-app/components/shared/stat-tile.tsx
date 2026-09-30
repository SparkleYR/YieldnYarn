import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import type { ElementType } from "react";

import { cn } from "@/lib/utils";

/**
 * Stat tile: label · big value · optional one-line explanation or delta.
 * Tiles in a row are always the same height (h-full inside a grid), and the
 * delta is never colour alone — it carries a trend icon too.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; direction: "up" | "down"; goodDirection?: "up" | "down" };
  icon?: ElementType;
}) {
  const isGood = delta && (delta.goodDirection ?? "up") === delta.direction;
  const DeltaIcon = delta?.direction === "up" ? IconTrendingUp : IconTrendingDown;

  return (
    <div className="panel flex h-full flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold text-body sm:text-[0.9375rem]">{label}</span>
        {Icon && (
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary-muted text-brand-primary sm:flex">
            <Icon size={20} stroke={2} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-extrabold tracking-tight text-heading tabular-nums sm:text-3xl">{value}</span>
        {delta && (
          <span className={cn("flex items-center gap-1 text-sm font-bold", isGood ? "text-success" : "text-error")}>
            <DeltaIcon size={16} />
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-auto text-sm text-muted-2">{hint}</p>}
    </div>
  );
}
