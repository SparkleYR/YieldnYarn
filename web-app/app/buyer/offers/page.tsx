"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  counterBid,
  listBids,
  updateBidStatus,
  type Bid,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { formatQty } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "needs-you" | "waiting" | "closed";

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: "needs-you", label: "offers.tab.needsYou" },
  { id: "waiting", label: "offers.tab.waiting" },
  { id: "closed", label: "offers.tab.closed" },
];

function inTab(bid: Bid, tab: Tab) {
  if (tab === "closed") return bid.status !== "PENDING";
  if (tab === "needs-you") return bid.status === "PENDING" && bid.awaiting_response_from === "BUYER";
  return bid.status === "PENDING" && bid.awaiting_response_from === "SELLER";
}

function rupees(value: string | number, locale = "en-IN") {
  return `₹${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

/** A buyer's bids and the sellers' counter-offers on them. Sellers counter
 * from the Android app; the buyer settles (or counters back) here. */
export default function OffersPage() {
  const { t, intlLocale } = useI18n();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("needs-you");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [counteringId, setCounteringId] = useState<number | null>(null);

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError(t("offers.signIn"));
        setLoading(false);
      }
      return;
    }
    try {
      const all: Bid[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await listBids(token, page);
        all.push(...res.results);
        if (!res.next) break;
      }
      if (!isCancelled()) {
        setBids(all);
        setError(null);
      }
    } catch (err) {
      if (!isCancelled()) setError(err instanceof ApiError ? err.message : t("offers.loadFailed"));
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

  const counts = useMemo(
    () =>
      Object.fromEntries(TABS.map((option) => [option.id, bids.filter((b) => inTab(b, option.id)).length])) as Record<
        Tab,
        number
      >,
    [bids]
  );
  const visible = bids.filter((b) => inTab(b, tab));

  async function act(bid: Bid, action: () => Promise<unknown>, success: string) {
    setBusyId(bid.id);
    try {
      await action();
      toast.success(success);
      setCounteringId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setBusyId(null);
    }
  }

  function withToken(fn: (token: string) => Promise<unknown>) {
    const token = getStoredTokens()?.access;
    if (!token) return Promise.reject(new Error("Not signed in"));
    return fn(token);
  }

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t("offers.title")} subtitle={t("offers.subtitle")} />

      <SegmentedTabs
        tabs={TABS.map((option) => ({ id: option.id, label: t(option.label), count: counts[option.id] }))}
        value={tab}
        onChange={setTab}
      />

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <p className="state-box border-dashed">
          {tab === "needs-you" ? t("offers.emptyNeedsYou") : t("offers.empty")}
        </p>
      )}

      {!loading && visible.length > 0 && (
        <ul className="flex flex-col gap-4">
          {visible.map((bid) => {
            const isCounter = bid.proposed_by !== null && bid.proposed_by !== bid.buyer;
            const total = Number(bid.offered_price) * Number(bid.offered_quantity);
            const busy = busyId === bid.id;
            return (
              <li key={bid.id} className="panel flex flex-col gap-4" data-testid={`offer-${bid.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-heading">{bid.commodity_name}</p>
                    <p className="text-sm font-medium text-muted-2">
                      {isCounter ? t("offers.counterFromSeller") : t("offers.yourOffer")}
                      {bid.parent_bid && !isCounter && t("offers.counteringSeller")}
                    </p>
                  </div>
                  <StatusBadge status={bid.status} />
                </div>

                <dl className="grid grid-cols-1 gap-2 rounded-xl bg-muted/60 p-4 sm:grid-cols-3 sm:gap-3 [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-3 sm:[&>div]:block">
                  <div>
                    <dt className="text-sm text-muted-2">{t("offers.price")}</dt>
                    <dd className="text-lg font-bold text-heading tabular-nums">
                      {rupees(bid.offered_price, intlLocale)}
                      <span className="text-sm font-semibold text-muted-2"> / {bid.unit}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-2">{t("common.quantity")}</dt>
                    <dd className="text-lg font-bold text-heading tabular-nums">
                      {formatQty(bid.offered_quantity, intlLocale)} {bid.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-2">{t("common.total")}</dt>
                    <dd className="text-lg font-extrabold text-brand-primary tabular-nums">{rupees(total, intlLocale)}</dd>
                  </div>
                </dl>
                {bid.message && <p className="text-[0.9375rem] text-body italic">“{bid.message}”</p>}

                {bid.status === "PENDING" && bid.awaiting_response_from === "BUYER" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act(bid, () => withToken((token) => updateBidStatus(bid.id, "ACCEPTED", token)), t("offers.accepted"))
                      }
                    >
                      {t("offers.accept", { total: rupees(total, intlLocale) })}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setCounteringId(counteringId === bid.id ? null : bid.id)}>
                      {t("offers.counter")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-error hover:bg-error/10 hover:text-error"
                      disabled={busy}
                      onClick={() => act(bid, () => withToken((token) => updateBidStatus(bid.id, "REJECTED", token)), t("offers.rejected"))}
                    >
                      {t("offers.reject")}
                    </Button>
                  </div>
                )}

                {counteringId === bid.id && (
                  <CounterForm
                    bid={bid}
                    busy={busy}
                    onSubmit={(price, quantity, message) =>
                      act(
                        bid,
                        () =>
                          withToken((token) =>
                            counterBid(bid.id, { offered_price: price, offered_quantity: quantity, message }, token)
                          ),
                        t("offers.countered")
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CounterForm({
  bid,
  busy,
  onSubmit,
}: {
  bid: Bid;
  busy: boolean;
  onSubmit: (price: number, quantity: number, message: string) => void;
}) {
  const [price, setPrice] = useState(String(Number(bid.offered_price)));
  const [quantity, setQuantity] = useState(String(Number(bid.offered_quantity)));
  const [message, setMessage] = useState("");
  const t = useI18n().t;
  const valid = Number(price) > 0 && Number(quantity) > 0;

  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(Number(price), Number(quantity), message.trim());
      }}
    >
      <label className="field-label flex flex-col gap-2">
        {t("offers.pricePer", { unit: bid.unit })}
        <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className="field-label flex flex-col gap-2">
        {t("offers.quantityIn", { unit: bid.unit })}
        <Input type="number" inputMode="decimal" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="field-label flex flex-col gap-2">
        {t("offers.message")}
        <Input value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={!valid || busy}>
          {t("offers.sendCounter")}
        </Button>
      </div>
    </form>
  );
}
