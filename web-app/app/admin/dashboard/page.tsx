"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconAdjustmentsHorizontal,
  IconCurrencyRupee,
  IconPackage,
  IconShoppingBag,
  IconUsers,
} from "@tabler/icons-react";

import {
  ApiError,
  getPlatformStats,
  listDisputes,
  listVerificationQueue,
  type Dispute,
  type PlatformStats,
  type VerificationQueueItem,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { formatRupeesShort } from "@/lib/format";
import { PageHeader, PanelHead } from "@/components/shared/page-header";
import { QuickAction } from "@/components/shared/quick-action";
import { StatTile } from "@/components/shared/stat-tile";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pendingVerification, setPendingVerification] = useState<VerificationQueueItem[]>([]);
  const [openDisputes, setOpenDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as an admin to view the dashboard.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const [statsRes, queueRes, disputesRes] = await Promise.all([
        getPlatformStats(token),
        listVerificationQueue(token),
        listDisputes(token),
      ]);
      if (!isCancelled()) {
        setStats(statsRes);
        setPendingVerification(queueRes);
        setOpenDisputes(
          disputesRes.results.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")
        );
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
      <div className="state-box">
        {error}
      </div>
    );
  }

  const listRow = "flex items-center justify-between gap-3 px-5 py-3.5";
  const viewAll = (href: string) => (
    <Link href={href} className="text-sm font-bold text-brand-primary hover:underline">
      View all
    </Link>
  );

  return (
    <div className="page">
      <PageHeader title="Admin home" subtitle="How the marketplace is doing, and what needs your attention." />

      <div className="grid-tiles">
        <StatTile
          label="Items listed"
          value={loading || !stats ? "…" : stats.total_listings.toLocaleString("en-IN")}
          hint="All listings, any status"
          icon={IconShoppingBag}
        />
        <StatTile
          label="Orders"
          value={loading || !stats ? "…" : stats.total_orders.toLocaleString("en-IN")}
          hint="Made so far"
          icon={IconPackage}
        />
        <StatTile
          label="People"
          value={loading || !stats ? "…" : stats.total_users.toLocaleString("en-IN")}
          hint="Buyers, sellers and staff"
          icon={IconUsers}
        />
        <StatTile
          label="Money in orders"
          value={loading || !stats ? "…" : formatRupeesShort(stats.revenue)}
          hint="Confirmed and delivered orders"
          delta={
            stats?.revenue_delta_pct != null
              ? {
                  value: `${Math.abs(stats.revenue_delta_pct)}%`,
                  direction: stats.revenue_delta_pct >= 0 ? "up" : "down",
                }
              : undefined
          }
          icon={IconCurrencyRupee}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel-flush">
          <PanelHead title="Waiting for a quality check" action={viewAll("/admin/verification")} />
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pendingVerification.slice(0, 4).map((item) => (
                <li key={item.id} className={listRow}>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-heading">{item.commodity_name}</p>
                    <p className="truncate text-sm text-muted-2">{item.seller_name}</p>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </li>
              ))}
              {pendingVerification.length === 0 && (
                <li className="px-5 py-10 text-center text-base text-body">Nothing waiting. Good job!</li>
              )}
            </ul>
          )}
        </div>

        <div className="panel-flush">
          <PanelHead title="Open complaints" action={viewAll("/admin/disputes")} />
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {openDisputes.slice(0, 4).map((dispute) => (
                <li key={dispute.id} className={listRow}>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-heading">Order #{dispute.order}</p>
                    <p className="truncate text-sm text-muted-2">From {dispute.raised_by_name}</p>
                  </div>
                  <StatusBadge status={dispute.status} />
                </li>
              ))}
              {openDisputes.length === 0 && (
                <li className="px-5 py-10 text-center text-base text-body">No open complaints.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="grid-cards">
        <QuickAction
          href="/admin/verticals"
          icon={IconAdjustmentsHorizontal}
          title="Categories & quality rules"
          description="What gets checked for each category, and how quality changes the price."
        />
        <QuickAction href="/admin/users" icon={IconUsers} title="People" description="See accounts and switch them on or off." />
        <QuickAction
          href="/admin/pricing"
          icon={IconCurrencyRupee}
          title="Market prices"
          description="Add prices by hand where the mandi feed has none (e.g. fabric)."
        />
      </div>
    </div>
  );
}
