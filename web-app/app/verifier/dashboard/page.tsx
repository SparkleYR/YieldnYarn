"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconClipboardCheck, IconClock } from "@tabler/icons-react";

import { ApiError, listVerificationQueue, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
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
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  const highPriorityCount = queue.filter((i) => i.priority === "HIGH").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label="Queue count" value={loading ? "…" : String(queue.length)} icon={IconClipboardCheck} />
        <StatTile label="High priority" value={loading ? "…" : String(highPriorityCount)} icon={IconClock} />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <div className="flex items-center justify-between border-b border-border-muted p-5">
          <h2 className="text-sm font-semibold text-heading">Next in queue</h2>
          <Link
            href="/verifier/queue"
            className="text-xs font-medium text-brand-primary-glow hover:underline"
          >
            View queue
          </Link>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border-muted">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-heading">{item.commodity_name}</p>
                  <p className="text-xs text-body">{item.flagged_reason}</p>
                </div>
                <div className="flex items-center gap-4">
                  {item.ai_confidence !== null && <ConfidenceBar value={item.ai_confidence} />}
                  <PriorityBadge priority={item.priority} />
                </div>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="px-5 py-6 text-center text-xs text-muted-2">Queue is empty.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
