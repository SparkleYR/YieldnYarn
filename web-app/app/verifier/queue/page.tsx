"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ApiError, listVerificationQueue, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PriorityBadge } from "@/components/shared/status-badge";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export default function VerifierQueuePage() {
  const [items, setItems] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as a verifier or admin to view the queue.");
          setLoading(false);
        }
        return;
      }
      try {
        const results = await listVerificationQueue(token);
        if (!cancelled) setItems(results);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the verification queue.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  if (error) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-heading">Verification queue</h1>
        <p className="text-sm text-body">
          {loading ? "Loading…" : `${sorted.length} listings awaiting review.`}
        </p>
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">Listing</TableHead>
              <TableHead>Flagged reason</TableHead>
              <TableHead>AI grade</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="pr-5 text-right">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border-muted hover:bg-transparent">
                  <TableCell className="pl-5" colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              sorted.map((item) => (
                <TableRow key={item.listing_id} className="border-border-muted">
                  <TableCell className="pl-5">
                    <p className="font-medium text-heading">{item.commodity_name}</p>
                    <p className="text-xs text-muted-2">{item.seller_name}</p>
                  </TableCell>
                  <TableCell className="max-w-xs text-body">{item.flagged_reason}</TableCell>
                  <TableCell className="text-body">{item.ai_grade ?? "Ungraded"}</TableCell>
                  <TableCell>
                    {item.ai_confidence !== null ? (
                      <ConfidenceBar value={item.ai_confidence} />
                    ) : (
                      <span className="text-xs text-muted-2">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={item.priority} />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/verifier/queue/${item.listing_id}`}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && sorted.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-2">
                  Queue is empty.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
