"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconCalculator,
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
import { getStoredTokens, getStoredUser } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PageHeader, PanelHead } from "@/components/shared/page-header";
import { QuickAction } from "@/components/shared/quick-action";
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
      <div className="state-box">
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

  const name = getStoredUser()?.profile?.display_name;

  return (
    <div className="page">
      <PageHeader
        title={name ? t("dashboard.greeting", { name }) : t("nav.dashboard")}
        subtitle={t("dashboard.subtitle")}
      />

      <div className="grid-tiles">
        <StatTile
          label={t("dashboard.openRequirements")}
          value={loading ? "…" : String(openRequirements)}
          hint={t("dashboard.openRequirementsHint")}
          icon={IconClipboardList}
        />
        <StatTile
          label={t("dashboard.activeOrders")}
          value={loading ? "…" : String(activeOrders)}
          hint={t("dashboard.activeOrdersHint")}
          icon={IconPackage}
        />
        <StatTile
          label={t("dashboard.totalSpend")}
          value={loading ? "…" : `₹${totalSpend.toLocaleString(intlLocale)}`}
          hint={t("dashboard.totalSpendHint")}
          icon={IconWallet}
        />
        <StatTile
          label={t("dashboard.listingsInCatalog")}
          value={loading || listingCount === null ? "…" : String(listingCount)}
          hint={t("dashboard.listingsInCatalogHint")}
          icon={IconShoppingBag}
        />
      </div>

      <div className="grid-cards">
        <QuickAction
          href="/buyer/catalog"
          icon={IconShoppingBag}
          title={t("dashboard.browse.title")}
          description={t("dashboard.browse.body")}
        />
        <QuickAction
          href="/buyer/requirements"
          icon={IconClipboardList}
          title={t("dashboard.post.title")}
          description={t("dashboard.post.body")}
        />
        <QuickAction
          href="/buyer/estimate"
          icon={IconCalculator}
          title={t("dashboard.estimate.title")}
          description={t("dashboard.estimate.body")}
        />
      </div>

      <div className="panel-flush">
        <PanelHead
          title={t("dashboard.recentOrders")}
          action={
            <Link href="/buyer/orders" className="text-sm font-bold text-brand-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          }
        />
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="px-5 py-10 text-center text-base text-body">{t("dashboard.noOrders")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("dashboard.order")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("dashboard.sellers")}</TableHead>
                <TableHead className="text-right">{t("common.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-bold text-heading">#{order.id}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>{t("dashboard.sellerCount", { count: order.allocations.length })}</TableCell>
                  <TableCell className="text-right font-bold text-heading tabular-nums">
                    {order.total_price ? `₹${Number(order.total_price).toLocaleString(intlLocale)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
