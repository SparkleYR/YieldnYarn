"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  listVerificationQueue,
  submitVerificationReview,
  type VerificationQueueItem,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatTile } from "@/components/shared/stat-tile";
import { PriorityBadge } from "@/components/shared/status-badge";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import { ReviewDialog, type ReviewAction } from "@/components/verification/review-dialog";
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

export default function AdminVerificationPage() {
  const [items, setItems] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<VerificationQueueItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as an admin to view the verification queue.");
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

  const highPriority = items.filter((i) => i.priority === "HIGH");
  const ungraded = items.filter((i) => i.ai_grade === null);
  const sorted = [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  async function handleResolve(item: VerificationQueueItem, action: ReviewAction, notes: string) {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as an admin to submit a review.");
      return;
    }
    try {
      await submitVerificationReview(
        item.listing_id,
        { decision: action === "REJECTED" ? "REJECT" : "APPROVE", notes },
        token
      );
      setItems((prev) => prev.filter((i) => i.listing_id !== item.listing_id));
      toast.success(
        action === "CONFIRMED"
          ? "AI grade confirmed."
          : action === "OVERRIDDEN"
            ? "Grade overridden."
            : "Listing rejected."
      );
      setActiveItem(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit review.");
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Pending review" value={loading ? "…" : String(items.length)} />
        <StatTile label="High priority" value={loading ? "…" : String(highPriority.length)} />
        <StatTile label="Ungraded" value={loading ? "…" : String(ungraded.length)} />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <div className="border-b border-border-muted p-5">
          <h2 className="text-sm font-semibold text-heading">Verification queue</h2>
          <p className="text-xs text-body">Shared with the verifier console — highest priority first.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">Listing</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>AI grade</TableHead>
              <TableHead>Confidence</TableHead>
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
                  <TableCell className="text-body capitalize">{item.vertical}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={item.priority} />
                  </TableCell>
                  <TableCell className="text-body">{item.ai_grade ?? "Ungraded"}</TableCell>
                  <TableCell>
                    {item.ai_confidence !== null ? (
                      <ConfidenceBar value={item.ai_confidence} />
                    ) : (
                      <span className="text-xs text-muted-2">—</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setActiveItem(item)}>
                      Review
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

      <ReviewDialog
        item={activeItem}
        open={activeItem !== null}
        onOpenChange={(open) => !open && setActiveItem(null)}
        onResolve={handleResolve}
      />
    </div>
  );
}
