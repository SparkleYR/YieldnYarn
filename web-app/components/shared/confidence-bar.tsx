import { cn } from "@/lib/utils";

/**
 * Magnitude bar for a 0–1 score (quality, or how sure the photo check is).
 * The number is always printed next to it, so colour is never the only cue.
 */
export function ConfidenceBar({
  value,
  className,
}: {
  /** 0–1 */
  value: number;
  className?: string;
}) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? "bg-success" : value >= 0.6 ? "bg-warning" : "bg-error";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums text-heading">{pct}%</span>
    </div>
  );
}
