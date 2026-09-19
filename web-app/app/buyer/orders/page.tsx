"use client";

import { useCallback, useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { ApiError, listOrders, type Order } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as a buyer to view orders.");
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
        setError(err instanceof ApiError ? err.message : "Failed to load orders.");
      }
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
        <h1 className="text-lg font-semibold text-heading">My orders</h1>
        <p className="mt-1 text-sm text-body">
          Orders can span multiple sellers — expand one to see the allocation.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-muted p-12 text-center text-sm text-body">
          No orders yet.
        </p>
      )}

      {!loading && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const isOpen = expanded === order.id;
            return (
              <div
                key={order.id}
                className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-heading">Order #{order.id}</span>
                    <StatusBadge status={order.status} />
                    {order.requirement && (
                      <span className="text-xs text-muted-2">
                        from requirement #{order.requirement}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-heading">
                      {order.total_price
                        ? `₹${Number(order.total_price).toLocaleString("en-IN")}`
                        : "—"}
                    </span>
                    <span className="text-xs text-muted-2">
                      {new Date(order.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <IconChevronDown
                      size={16}
                      className={cn(
                        "text-muted-2 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border-muted px-5 py-4">
                    <p className="text-xs font-medium tracking-wide text-muted-2 uppercase">
                      Allocation
                    </p>
                    <ul className="mt-3 flex flex-col divide-y divide-border-muted">
                      {order.allocations.map((alloc) => (
                        <li
                          key={alloc.id}
                          className="flex items-center justify-between py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-medium text-heading">{alloc.commodity_name}</p>
                            <p className="text-xs text-muted-2">{alloc.seller_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-heading">
                              {alloc.allocated_quantity} {alloc.unit}
                            </p>
                            <p className="text-xs text-muted-2">
                              ₹{Number(alloc.unit_price).toLocaleString("en-IN")} / {alloc.unit}
                            </p>
                          </div>
                        </li>
                      ))}
                      {order.allocations.length === 0 && (
                        <li className="py-4 text-center text-xs text-muted-2">
                          Not yet allocated to any seller.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
