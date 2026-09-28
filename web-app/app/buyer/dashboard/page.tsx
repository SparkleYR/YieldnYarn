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
import { useI18n } from "@/lib/i18n";
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
  const { t, intlLocale } = useI18n();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError(t("dashboard.signIn"));
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
        setError(err instanceof ApiError ? err.message : t("dashboard.loadFailed"));
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
          label={t("dashboard.openRequirements")}
          value={loading ? "…" : String(openRequirements)}
          icon={IconClipboardList}
        />
        <StatTile
          label={t("dashboard.activeOrders")}
          value={loading ? "…" : String(activeOrders)}
          icon={IconPackage}
        />
        <StatTile
          label={t("dashboard.totalSpend")}
          value={loading ? "…" : `₹${totalSpend.toLocaleString(intlLocale)}`}
          icon={IconWallet}
        />
        <StatTile
          label={t("dashboard.listingsInCatalog")}
          value={loading || listingCount === null ? "…" : String(listingCount)}
          icon={IconShoppingBag}
        />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <div className="flex items-center justify-between border-b border-border-muted p-5">
          <h2 className="text-sm font-semibold text-heading">{t("dashboard.recentOrders")}</h2>
          <Link
            href="/buyer/orders"
            className="text-xs font-medium text-brand-primary-glow hover:underline"
          >
            {t("common.viewAll")}
          </Link>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="p-5 text-center text-sm text-muted-2">{t("dashboard.noOrders")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableHead className="pl-5">{t("dashboard.order")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("dashboard.sellers")}</TableHead>
                <TableHead className="pr-5 text-right">{t("common.total")}</TableHead>
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
                    {t("dashboard.sellerCount", { count: order.allocations.length })}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-heading">
                    {order.total_price ? `₹${Number(order.total_price).toLocaleString(intlLocale)}` : "—"}
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
          title={t("dashboard.browse.title")}
          description={t("dashboard.browse.body")}
        />
        <QuickLink
          href="/buyer/requirements"
          title={t("dashboard.post.title")}
          description={t("dashboard.post.body")}
        />
        <QuickLink
          href="/buyer/estimate"
          title={t("dashboard.estimate.title")}
          description={t("dashboard.estimate.body")}
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
