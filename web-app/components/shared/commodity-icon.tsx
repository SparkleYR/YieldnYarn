import { IconNeedleThread, IconWheat } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/** Square icon tile for a listing: wheat for crops, needle & thread for cloth. */
export function CommodityIcon({ vertical, className }: { vertical?: string; className?: string }) {
  const cloth = vertical === "textiles";
  const Icon = cloth ? IconNeedleThread : IconWheat;
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl",
        cloth ? "bg-info/10 text-info" : "bg-warning/10 text-warning",
        className
      )}
      aria-hidden
    >
      <Icon size={26} stroke={1.8} />
    </span>
  );
}
