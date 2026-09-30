"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconClipboardCheck, IconClock } from "@tabler/icons-react";

import { ApiError, listVerificationQueue, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PageHeader, PanelHead } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { PriorityBadge } from "@/components/shared/status-badge";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import { Skeleton } from "@/components/ui/skeleton";

export default function VerifierDashboardPage() {
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as a verifier to view the dashboard.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await listVerificationQueue(token);
      if (!isCancelled()) setQueue(res);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load the queue.");
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

  const highPriorityCount = queue.filter((i) => i.priority === "HIGH").length;

  return (
    <div className="page">
      <PageHeader title="Checker home" subtitle="Look at the seller's photos and confirm the quality before buyers see the listing." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile label="Waiting to be checked" value={loading ? "…" : String(queue.length)} hint="Listings in your list" icon={IconClipboardCheck} />
        <StatTile label="Urgent" value={loading ? "…" : String(highPriorityCount)} hint="Photo check was least sure — do these first" icon={IconClock} />
      </div>

      <div className="panel-flush">
        <PanelHead
          title="Next up"
          action={
            <Link href="/verifier/queue" className="text-sm font-bold text-brand-primary hover:underline">
              See all
            </Link>
          }
        />
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((item) => (
              <li key={item.id}>
                <Link href={`/verifier/queue/${item.listing_id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-bold text-heading">{item.commodity_name}</p>
                  <p className="text-sm text-muted-2">{item.flagged_reason}</p>
                </div>
                <div className="flex items-center gap-4">
                  {item.ai_confidence !== null && <ConfidenceBar value={item.ai_confidence} />}
                  <PriorityBadge priority={item.priority} />
                </div>
                </Link>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="px-5 py-10 text-center text-base text-body">Nothing to check right now.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
