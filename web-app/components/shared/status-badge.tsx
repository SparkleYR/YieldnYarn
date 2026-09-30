"use client";

import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type Tone = "good" | "wait" | "info" | "bad" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "good",
  CONFIRMED: "good",
  FULFILLED: "good",
  MATCHED: "good",
  ACCEPTED: "good",
  DELIVERED: "good",
  PENDING: "wait",
  PENDING_GRADING: "wait",
  PENDING_VERIFICATION: "wait",
  OPEN: "wait",
  UNDER_REVIEW: "wait",
  SOLD: "info",
  RESOLVED: "info",
  COUNTERED: "info",
  DRAFT: "neutral",
  CANCELLED: "bad",
  DISPUTED: "bad",
  EXPIRED: "bad",
  ESCALATED: "bad",
  REJECTED: "bad",
};

const TONE_CLASS: Record<Tone, { text: string; pill: string; dot: string }> = {
  good: { text: "text-success", pill: "bg-success/10", dot: "bg-success" },
  wait: { text: "text-warning", pill: "bg-warning/10", dot: "bg-warning" },
  info: { text: "text-info", pill: "bg-info/10", dot: "bg-info" },
  bad: { text: "text-error", pill: "bg-error/10", dot: "bg-error" },
  neutral: { text: "text-muted-2", pill: "bg-muted", dot: "bg-muted-2" },
};

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function Pill({ tone, label }: { tone: Tone; label: string }) {
  const c = TONE_CLASS[tone];
  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap",
        c.pill,
        c.text
      )}
    >
      <span className={cn("size-2 rounded-full", c.dot)} aria-hidden />
      {label}
    </span>
  );
}

/** Status in plain words (translated), always a label and never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const key = `status.${status}` as MessageKey;
  const translated = t(key);
  const label = translated === key ? formatStatus(status) : translated;
  return <Pill tone={STATUS_TONE[status] ?? "neutral"} label={label} />;
}

const PRIORITY_TONE: Record<string, Tone> = { HIGH: "bad", MEDIUM: "wait", LOW: "neutral" };

/** Same pill treatment as StatusBadge, for the checking queue's priority. */
export function PriorityBadge({ priority }: { priority: string }) {
  return <Pill tone={PRIORITY_TONE[priority] ?? "neutral"} label={formatStatus(priority)} />;
}
