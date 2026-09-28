"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  ApiError,
  counterBid,
  listBids,
  updateBidStatus,
  type Bid,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "needs-you" | "waiting" | "closed";

const TABS: { id: Tab; label: string }[] = [
  { id: "needs-you", label: "Needs your reply" },
  { id: "waiting", label: "Waiting on seller" },
  { id: "closed", label: "Closed" },
];

function inTab(bid: Bid, tab: Tab) {
  if (tab === "closed") return bid.status !== "PENDING";
  if (tab === "needs-you") return bid.status === "PENDING" && bid.awaiting_response_from === "BUYER";
  return bid.status === "PENDING" && bid.awaiting_response_from === "SELLER";
}

function rupees(value: string | number) {
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** A buyer's bids and the sellers' counter-offers on them. Sellers counter
 * from the Android app; the buyer settles (or counters back) here. */
export default function OffersPage() {
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
        setError("You must be signed in as a buyer to view your offers.");
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
      if (!isCancelled()) setError(err instanceof ApiError ? err.message : "Failed to load offers.");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

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
    () => Object.fromEntries(TABS.map((t) => [t.id, bids.filter((b) => inTab(b, t.id)).length])) as Record<Tab, number>,
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
      toast.error(err instanceof ApiError ? err.message : "Something went wrong.");
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
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-heading">My offers</h1>
        <p className="mt-1 text-sm text-body">
          Your bids, and any counter-offers sellers have made. Accepting a counter-offer creates the order.
        </p>
      </div>

      <div className="flex gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              tab === t.id
                ? "border-heading bg-heading text-surface"
                : "border-border-muted text-body hover:text-heading"
            )}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="ml-1.5 opacity-70">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-muted p-12 text-center text-sm text-body">
          {tab === "needs-you" ? "Nothing needs your reply right now." : "No offers here."}
        </p>
      )}

      {!loading && visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((bid) => {
            const isCounter = bid.proposed_by !== null && bid.proposed_by !== bid.buyer;
            const total = Number(bid.offered_price) * Number(bid.offered_quantity);
            const busy = busyId === bid.id;
            return (
              <li key={bid.id} className="rounded-2xl border border-border-muted bg-surface p-5" data-testid={`offer-${bid.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-heading">{bid.commodity_name}</p>
                    <p className="text-xs text-muted-2">
                      {isCounter ? "Counter-offer from the seller" : "Your offer"}
                      {bid.parent_bid && !isCounter && " (countering the seller)"}
                    </p>
                  </div>
                  <StatusBadge status={bid.status} />
                </div>
                <p className="mt-3 text-sm text-heading">
                  {rupees(bid.offered_price)} / {bid.unit} × {Number(bid.offered_quantity)} {bid.unit}
                  <span className="ml-2 text-muted-2">= {rupees(total)}</span>
                </p>
                {bid.message && <p className="mt-1 text-sm text-body">“{bid.message}”</p>}

                {bid.status === "PENDING" && bid.awaiting_response_from === "BUYER" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act(bid, () => withToken((t) => updateBidStatus(bid.id, "ACCEPTED", t)), "Offer accepted — your order has been created.")
                      }
                    >
                      Accept {rupees(total)}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setCounteringId(counteringId === bid.id ? null : bid.id)}>
                      Counter
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => act(bid, () => withToken((t) => updateBidStatus(bid.id, "REJECTED", t)), "Offer rejected.")}
                    >
                      Reject
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
                        () => withToken((t) => counterBid(bid.id, { offered_price: price, offered_quantity: quantity, message }, t)),
                        "Counter-offer sent to the seller."
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
  const valid = Number(price) > 0 && Number(quantity) > 0;

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-border-muted p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(Number(price), Number(quantity), message.trim());
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-2">
        Price per {bid.unit} (₹)
        <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-2">
        Quantity ({bid.unit})
        <Input type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-2">
        Message (optional)
        <Input value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" disabled={!valid || busy}>
          Send counter-offer
        </Button>
      </div>
    </form>
  );
}
