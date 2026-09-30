"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconMapPin, IconSearch, IconUser } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import {
  ApiError,
  listListings,
  listVerticals,
  type Listing,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatQty } from "@/lib/format";
import { CommodityIcon } from "@/components/shared/commodity-icon";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = "price_asc" | "price_desc" | "grade";

export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogBrowser />
    </Suspense>
  );
}

function listingPrice(listing: Listing) {
  const raw = listing.price_final ?? listing.price_suggested;
  return raw !== null ? Number(raw) : 0;
}

function CatalogBrowser() {
  const searchParams = useSearchParams();
  const initialVertical = searchParams.get("vertical") ?? "all";
  const { t, intlLocale } = useI18n();

  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vertical, setVertical] = useState<string>(initialVertical);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("price_asc");

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const [verticalsRes, listingsRes] = await Promise.all([
        listVerticals(token ?? ""),
        listListings(token ?? undefined),
      ]);
      if (!isCancelled()) {
        setVerticals(verticalsRes.results);
        setListings(listingsRes.results);
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : t("catalog.loadFailed"));
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

  const verticalsById = useMemo(() => new Map(verticals.map((v) => [v.id, v])), [verticals]);

  const visible = useMemo(() => {
    let result = listings.filter(
      (l) => l.status === "ACTIVE" || l.status === "PENDING_VERIFICATION"
    );
    if (vertical !== "all") {
      result = result.filter((l) => verticalsById.get(l.vertical)?.slug === vertical);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(
        (l) =>
          l.commodity_name.toLowerCase().includes(q) ||
          l.sub_category.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      if (sort === "price_asc") return listingPrice(a) - listingPrice(b);
      if (sort === "price_desc") return listingPrice(b) - listingPrice(a);
      return (a.grade ?? "Ungraded").localeCompare(b.grade ?? "Ungraded");
    });
    return result;
  }, [listings, vertical, query, sort, verticalsById]);

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <IconSearch size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-2" />
          <Input
            placeholder={t("catalog.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11"
            aria-label={t("catalog.search")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <Select value={vertical} onValueChange={setVertical}>
            <SelectTrigger className="w-full md:w-48" aria-label={t("common.vertical")}>
              <SelectValue placeholder={t("common.vertical")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("catalog.allVerticals")}</SelectItem>
              {verticals.map((v) => (
                <SelectItem key={v.id} value={v.slug}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-full md:w-48" aria-label={t("catalog.sort")}>
              <SelectValue placeholder={t("catalog.sort")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price_asc">{t("catalog.sort.priceAsc")}</SelectItem>
              <SelectItem value="price_desc">{t("catalog.sort.priceDesc")}</SelectItem>
              <SelectItem value="grade">{t("catalog.sort.grade")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid-cards">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="state-box border-dashed">{t("catalog.empty")}</p>
      ) : (
        <div className="grid-cards">
          {visible.map((listing) => {
            const price = listingPrice(listing);
            const place =
              listing.region ||
              (listing.location_lat !== null && listing.location_lng !== null
                ? `${listing.location_lat.toFixed(2)}, ${listing.location_lng.toFixed(2)}`
                : "");
            return (
              <Link
                key={listing.id}
                href={`/buyer/catalog/${listing.id}`}
                className="panel flex h-full flex-col gap-4 transition-colors hover:border-brand-primary/60"
              >
                <div className="flex items-start gap-3">
                  <CommodityIcon vertical={verticalsById.get(listing.vertical)?.slug} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-heading">{listing.commodity_name}</p>
                    <p className="truncate text-sm text-body">{listing.sub_category || "\u00a0"}</p>
                  </div>
                  <StatusBadge status={listing.status} />
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold tracking-tight text-heading tabular-nums">
                    ₹{price.toLocaleString(intlLocale)}
                  </span>
                  <span className="text-sm font-semibold text-muted-2">/ {listing.unit}</span>
                  <Badge
                    className={cn(
                      "ml-auto",
                      listing.grade === null ? "bg-muted text-muted-2" : "bg-brand-primary-muted text-brand-primary-hover"
                    )}
                  >
                    {listing.grade ?? t("catalog.ungraded")}
                  </Badge>
                </div>

                <dl className="mt-auto grid grid-cols-1 gap-1.5 border-t border-border pt-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-2">{t("catalog.availableLabel")}</dt>
                    <dd className="font-bold text-heading">
                      {formatQty(listing.quantity, intlLocale)} {listing.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-muted-2">
                      <IconMapPin size={16} />
                      {t("common.region")}
                    </dt>
                    <dd className="truncate font-semibold text-heading">{place || "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-muted-2">
                      <IconUser size={16} />
                      {t("common.seller")}
                    </dt>
                    <dd className="truncate font-semibold text-heading">{listing.seller_name}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
