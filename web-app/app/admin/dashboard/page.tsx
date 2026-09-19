"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconShoppingBag,
  IconPackage,
  IconUsers,
  IconCurrencyRupee,
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
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total listings"
          value={loading || !stats ? "…" : stats.total_listings.toLocaleString("en-IN")}
          icon={IconShoppingBag}
        />
        <StatTile
          label="Total orders"
          value={loading || !stats ? "…" : stats.total_orders.toLocaleString("en-IN")}
          icon={IconPackage}
        />
        <StatTile
          label="Total users"
          value={loading || !stats ? "…" : stats.total_users.toLocaleString("en-IN")}
          icon={IconUsers}
        />
        <StatTile
          label="Committed revenue"
          value={loading || !stats ? "…" : `₹${(stats.revenue / 100000).toFixed(1)}L`}
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
        <div className="rounded-2xl border border-border-muted bg-surface">
          <div className="flex items-center justify-between border-b border-border-muted p-5">
            <h2 className="text-sm font-semibold text-heading">Verification queue</h2>
            <Link
              href="/admin/verification"
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
          ) : (
            <ul className="divide-y divide-border-muted">
              {pendingVerification.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-heading">{item.commodity_name}</p>
                    <p className="text-xs text-body">{item.seller_name}</p>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </li>
              ))}
              {pendingVerification.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-muted-2">Queue is empty.</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border-muted bg-surface">
          <div className="flex items-center justify-between border-b border-border-muted p-5">
            <h2 className="text-sm font-semibold text-heading">Open disputes</h2>
            <Link
              href="/admin/disputes"
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
          ) : (
            <ul className="divide-y divide-border-muted">
              {openDisputes.slice(0, 4).map((dispute) => (
                <li key={dispute.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-heading">Order #{dispute.order}</p>
                    <p className="text-xs text-body">{dispute.raised_by_name}</p>
                  </div>
                  <StatusBadge status={dispute.status} />
                </li>
              ))}
              {openDisputes.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-muted-2">No open disputes.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickLink
          href="/admin/verticals"
          title="Configure verticals"
          description="Edit grading attributes and pricing rules."
        />
        <QuickLink
          href="/admin/users"
          title="Manage users"
          description="Review roles and account status."
        />
        <QuickLink
          href="/admin/pricing"
          title="Enter prices"
          description="Add manual price points for textiles."
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
