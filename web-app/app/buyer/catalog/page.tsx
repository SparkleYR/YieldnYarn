"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconMapPin, IconUser } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import {
  ApiError,
  listListings,
  listVerticals,
  type Listing,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
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
        setError(err instanceof ApiError ? err.message : "Failed to load the catalog.");
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
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search commodity or variety…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Select value={vertical} onValueChange={setVertical}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Vertical" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All verticals</SelectItem>
              {verticals.map((v) => (
                <SelectItem key={v.id} value={v.slug}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price_asc">Price: low to high</SelectItem>
              <SelectItem value="price_desc">Price: high to low</SelectItem>
              <SelectItem value="grade">Grade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-muted p-12 text-center text-sm text-body">
          No listings match your filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => {
            const price = listingPrice(listing);
            return (
              <Link
                key={listing.id}
                href={`/buyer/catalog/${listing.id}`}
                className="flex flex-col rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-brand-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-heading">
                      {listing.commodity_name}
                      {listing.sub_category && (
                        <span className="ml-1.5 font-normal text-muted-2">
                          · {listing.sub_category}
                        </span>
                      )}
                    </p>
                    {listing.location_lat !== null && listing.location_lng !== null && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-2">
                        <IconMapPin size={12} />
                        {listing.location_lat.toFixed(2)}, {listing.location_lng.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={listing.status} />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Badge
                    className={cn(
                      listing.grade === null
                        ? "bg-muted text-muted-2"
                        : "bg-brand-primary/15 text-brand-primary-glow"
                    )}
                  >
                    {listing.grade ?? "Ungraded"}
                  </Badge>
                  {listing.grade !== null && listing.grade_confidence !== null && (
                    <span className="text-xs text-muted-2">
                      {Math.round(listing.grade_confidence * 100)}% confidence
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-end justify-between pt-4">
                  <div>
                    <p className="text-lg font-semibold text-heading">
                      ₹{price.toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-muted-2"> /{listing.unit}</span>
                    </p>
                    <p className="text-xs text-muted-2">
                      {listing.quantity} {listing.unit} available
                    </p>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-body">
                    <IconUser size={12} />
                    {listing.seller_name}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
