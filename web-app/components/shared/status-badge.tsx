import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // good
  ACTIVE: "text-success",
  CONFIRMED: "text-success",
  FULFILLED: "text-success",
  MATCHED: "text-success",
  // pending / neutral-warm
  PENDING: "text-warning",
  PENDING_GRADING: "text-warning",
  PENDING_VERIFICATION: "text-warning",
  OPEN: "text-warning",
  UNDER_REVIEW: "text-warning",
  DRAFT: "text-muted-2",
  // resolved-neutral
  SOLD: "text-info",
  RESOLVED: "text-info",
  // bad
  CANCELLED: "text-error",
  DISPUTED: "text-error",
  EXPIRED: "text-error",
  ESCALATED: "text-error",
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-success",
  CONFIRMED: "bg-success",
  FULFILLED: "bg-success",
  MATCHED: "bg-success",
  PENDING: "bg-warning",
  PENDING_GRADING: "bg-warning",
  PENDING_VERIFICATION: "bg-warning",
  OPEN: "bg-warning",
  UNDER_REVIEW: "bg-warning",
  DRAFT: "bg-muted-2",
  SOLD: "bg-info",
  RESOLVED: "bg-info",
  CANCELLED: "bg-error",
  DISPUTED: "bg-error",
  EXPIRED: "bg-error",
  ESCALATED: "bg-error",
};

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Status is always paired with a label, never color alone. */
export function StatusBadge({ status }: { status: string }) {
  const textClass = STATUS_STYLES[status] ?? "text-muted-2";
  const dotClass = STATUS_DOT[status] ?? "bg-muted-2";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", textClass)}>
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      {formatStatus(status)}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "text-error",
  MEDIUM: "text-warning",
  LOW: "text-muted-2",
};

/** Same paired dot+label treatment as StatusBadge, for queue priority. */
export function PriorityBadge({ priority }: { priority: string }) {
  const textClass = PRIORITY_STYLES[priority] ?? "text-muted-2";
  const dotClass = STATUS_DOT[priority === "HIGH" ? "CANCELLED" : priority === "MEDIUM" ? "PENDING" : "DRAFT"];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", textClass)}>
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      {formatStatus(priority)}
    </span>
  );
}
