"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconClipboardList,
  IconPackage,
  IconShoppingBag,
  IconWallet,
} from "@tabler/icons-react";

import {
  ApiError,
  listListings,
  listOrders,
  listRequirements,
  type Order,
  type Requirement,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function BuyerDashboardPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as a buyer to view the dashboard.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const [requirementsRes, ordersRes, listingsRes] = await Promise.all([
        listRequirements(token),
        listOrders(token),
        listListings(token),
      ]);
      if (!isCancelled()) {
        setRequirements(requirementsRes.results);
        setOrders(ordersRes.results);
        setListingCount(listingsRes.count);
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load the dashboard.");
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

  const openRequirements = requirements.filter((r) => r.status === "OPEN").length;
  const activeOrders = orders.filter((o) => o.status !== "FULFILLED" && o.status !== "CANCELLED").length;
  const totalSpend = orders.reduce((sum, o) => sum + (o.total_price ? Number(o.total_price) : 0), 0);
  const recentOrders = [...orders]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open requirements"
          value={loading ? "…" : String(openRequirements)}
          icon={IconClipboardList}
        />
        <StatTile
          label="Active orders"
          value={loading ? "…" : String(activeOrders)}
          icon={IconPackage}
        />
        <StatTile
          label="Total spend"
          value={loading ? "…" : `₹${totalSpend.toLocaleString("en-IN")}`}
          icon={IconWallet}
        />
        <StatTile
          label="Listings in catalog"
          value={loading || listingCount === null ? "…" : String(listingCount)}
          icon={IconShoppingBag}
        />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <div className="flex items-center justify-between border-b border-border-muted p-5">
          <h2 className="text-sm font-semibold text-heading">Recent orders</h2>
          <Link
            href="/buyer/orders"
            className="text-xs font-medium text-brand-primary-glow hover:underline"
          >
            View all
          </Link>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="p-5 text-center text-sm text-muted-2">No orders yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableHead className="pl-5">Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sellers</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id} className="border-border-muted">
                  <TableCell className="pl-5 font-medium text-heading">#{order.id}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-body">
                    {order.allocations.length} seller{order.allocations.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-heading">
                    {order.total_price ? `₹${Number(order.total_price).toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickLink
          href="/buyer/catalog"
          title="Browse catalog"
          description="Search active listings across verticals."
        />
        <QuickLink
          href="/buyer/requirements"
          title="Post a requirement"
          description="Let the matching engine find sellers for you."
        />
        <QuickLink
          href="/buyer/estimate"
          title="Estimate a cost"
          description="Get a grade-adjusted price before you commit."
        />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-brand-primary/40"
    >
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <p className="mt-1 text-xs text-body">{description}</p>
    </Link>
  );
}
