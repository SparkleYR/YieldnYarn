"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconChevronDown } from "@tabler/icons-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ApiError, createDispute, listOrders, type DisputeType, type Order } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatQty, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersPage() {
  const { t, intlLocale } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reporting, setReporting] = useState<Order | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError(t("orders.signIn"));
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await listOrders(token);
      if (!isCancelled()) setOrders(res.results);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : t("orders.loadFailed"));
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load(() => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t("orders.title")} subtitle={t("orders.subtitle")} />

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && <p className="state-box border-dashed">{t("orders.empty")}</p>}

      {!loading && orders.length > 0 && (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const isOpen = expanded === order.id;
            return (
              <div key={order.id} className="panel-flush">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-5 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <span className="text-lg font-bold text-heading">
                    {t("dashboard.order")} #{order.id}
                  </span>
                  <StatusBadge status={order.status} />
                  <span className="text-sm font-medium text-muted-2">
                    {new Date(order.created_at).toLocaleDateString(intlLocale, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-lg font-extrabold text-heading tabular-nums">
                      {order.total_price ? formatRupees(order.total_price, intlLocale) : "—"}
                    </span>
                    <IconChevronDown size={22} className={cn("text-muted-2 transition-transform", isOpen && "rotate-180")} />
                  </span>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-border p-5">
                    {order.requirement && (
                      <p className="text-sm font-medium text-muted-2">{t("orders.fromRequirement", { id: order.requirement })}</p>
                    )}
                    <p className="text-sm font-bold text-heading">{t("orders.allocation")}</p>
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                      {order.allocations.map((alloc) => (
                        <li key={alloc.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-heading">{alloc.commodity_name}</p>
                            <p className="truncate text-sm text-muted-2">{alloc.seller_name}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-bold text-heading tabular-nums">
                              {formatQty(alloc.allocated_quantity, intlLocale)} {alloc.unit}
                            </p>
                            <p className="text-sm text-muted-2 tabular-nums">
                              {formatRupees(alloc.unit_price, intlLocale)} / {alloc.unit}
                            </p>
                          </div>
                        </li>
                      ))}
                      {order.allocations.length === 0 && (
                        <li className="px-4 py-6 text-center text-sm text-muted-2">{t("orders.notAllocated")}</li>
                      )}
                    </ul>
                    {order.allocations.length > 0 && (
                      <Button
                        variant="outline"
                        className="w-fit text-error hover:bg-error/5 hover:text-error"
                        onClick={() => setReporting(order)}
                      >
                        <IconAlertTriangle />
                        {t("orders.report")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReportProblemDialog order={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}

const PROBLEMS: { type: DisputeType; key: "orders.problem.quantity" | "orders.problem.quality" | "orders.problem.grade" | "orders.problem.other" }[] = [
  { type: "QUANTITY_SHORTAGE", key: "orders.problem.quantity" },
  { type: "QUALITY_DEFECT", key: "orders.problem.quality" },
  { type: "GRADE_MISMATCH", key: "orders.problem.grade" },
  { type: "OTHER", key: "orders.problem.other" },
];

/** Buyer reports a problem with an order (a dispute against its seller). */
function ReportProblemDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<DisputeType>("QUANTITY_SHORTAGE");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const sellerId = order?.allocations[0]?.seller;

  async function submit() {
    const token = getStoredTokens()?.access;
    if (!order || !token || sellerId === undefined) return;
    setSending(true);
    try {
      await createDispute({ order: order.id, against: sellerId, type, description: description.trim() }, token);
      toast.success(t("orders.reported"));
      setDescription("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("orders.reportTitle", { id: order?.id ?? "" })}</DialogTitle>
          <DialogDescription>{t("orders.reportBody")}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label={t("orders.reportWhat")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROBLEMS.map((problem) => (
            <button
              key={problem.type}
              type="button"
              role="radio"
              aria-checked={type === problem.type}
              onClick={() => setType(problem.type)}
              className={cn(
                "flex min-h-12 items-center rounded-xl border-2 px-4 py-2.5 text-left text-[0.9375rem] font-semibold transition-colors",
                type === problem.type ? "border-brand-primary bg-brand-primary-muted text-heading" : "border-border text-body hover:border-input"
              )}
            >
              {t(problem.key)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="problem-details">{t("orders.reportDetails")}</Label>
          <Textarea
            id="problem-details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("orders.reportPlaceholder")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={sending || description.trim().length === 0}>
            {sending ? t("listing.sending") : t("orders.reportSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
