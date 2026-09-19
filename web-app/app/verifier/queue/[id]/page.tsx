"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";

import { ApiError, listVerificationQueue, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { VerifierReviewPanel } from "@/components/verifier/review-panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function VerifierQueueDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = Number(params.id);

  const [item, setItem] = useState<VerificationQueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as a verifier or admin to review this listing.");
          setLoading(false);
        }
        return;
      }
      try {
        // No single-item detail endpoint exists — the queue is small enough
        // that fetching it and finding by listing_id is the real contract.
        const results = await listVerificationQueue(token);
        const found = results.find((i) => i.listing_id === listingId) ?? null;
        if (!cancelled) {
          if (found) setItem(found);
          else setMissing(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load this listing.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(listingId)) {
      load();
    }

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

  if (loading || !item) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return <VerifierReviewPanel item={item} />;
}
