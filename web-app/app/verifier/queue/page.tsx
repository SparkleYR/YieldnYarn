"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ApiError, listVerificationQueue, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PriorityBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
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
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Photos to check"
        subtitle={loading ? "Loading…" : `${sorted.length} listing${sorted.length === 1 ? "" : "s"} waiting. Most urgent first.`}
      />

      <div className="panel-flush">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead>Why it needs you</TableHead>
              <TableHead>Photo-check grade</TableHead>
              <TableHead>How sure</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border hover:bg-transparent">
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              sorted.map((item) => (
                <TableRow key={item.listing_id} className="border-border">
                  <TableCell>
                    <p className="font-bold text-heading">{item.commodity_name}</p>
                    <p className="text-sm text-muted-2">{item.seller_name}</p>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{item.flagged_reason}</TableCell>
                  <TableCell className="font-semibold text-heading">{item.ai_grade ?? "No grade"}</TableCell>
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
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/verifier/queue/${item.listing_id}`}>Check</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && sorted.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center text-base whitespace-normal">
                  Nothing to check right now.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
