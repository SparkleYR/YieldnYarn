"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { IconMapPin } from "@tabler/icons-react";

import { ApiError, getListing, type Listing } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingActions } from "@/components/buyer/listing-actions";

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = Number(params.id);

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(listingId)) return;
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      try {
        const result = await getListing(listingId, token);
        if (!cancelled) setListing(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setMissing(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Failed to load this listing.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (missing || !Number.isFinite(listingId)) {
    notFound();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  if (loading || !listing) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const price = Number(listing.price_final ?? listing.price_suggested ?? 0);
  const suggested = listing.price_suggested !== null ? Number(listing.price_suggested) : null;
  const gradeAdjustment = suggested !== null ? price - suggested : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-heading">
            {listing.commodity_name}
            {listing.sub_category && ` — ${listing.sub_category}`}
          </h1>
          <StatusBadge status={listing.status} />
        </div>
        {listing.location_lat !== null && listing.location_lng !== null && (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-2">
            <IconMapPin size={14} />
            {listing.location_lat.toFixed(2)}, {listing.location_lng.toFixed(2)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900/30 via-neutral-900 to-neutral-950">
            <span className="text-5xl font-bold text-white/5">
              {listing.commodity_name}
            </span>
          </div>

          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-heading">Grading report</h2>
              <Badge
                className={
                  listing.grade === null
                    ? "bg-muted text-muted-2"
                    : "bg-brand-primary/15 text-brand-primary-glow"
                }
              >
                {listing.grade ?? "Ungraded"}
              </Badge>
            </div>
            {listing.grade !== null && listing.grade_confidence !== null ? (
              <p className="mt-3 text-xs text-muted-2">
                {Math.round(listing.grade_confidence * 100)}% model confidence on the latest grading result.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-2">
                This listing hasn&apos;t been graded yet.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <h2 className="text-sm font-semibold text-heading">Price breakdown</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {suggested !== null && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-body">Base market price</dt>
                    <dd className="text-heading">₹{suggested.toLocaleString("en-IN")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-body">Grade adjustment</dt>
                    <dd className={gradeAdjustment >= 0 ? "text-success" : "text-error"}>
                      {gradeAdjustment >= 0 ? "+" : ""}
                      ₹{gradeAdjustment.toLocaleString("en-IN")}
                    </dd>
                  </div>
                </>
              )}
              <div className="mt-1 flex justify-between border-t border-border-muted pt-2 font-semibold">
                <dt className="text-heading">Final price</dt>
                <dd className="text-heading">
                  ₹{price.toLocaleString("en-IN")} / {listing.unit}
                </dd>
              </div>
              <div className="flex justify-between text-xs text-muted-2">
                <dt>Available quantity</dt>
                <dd>
                  {listing.quantity} {listing.unit}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <h2 className="text-sm font-semibold text-heading">Seller</h2>
            <p className="mt-2 text-sm font-medium text-heading">{listing.seller_name}</p>
          </div>

          <ListingActions listing={listing} price={price} />
        </div>
      </div>
    </div>
  );
}
