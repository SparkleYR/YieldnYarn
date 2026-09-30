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
import { PageHeader, PanelHead } from "@/components/shared/page-header";
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
      toast.error("Please log in again to save your check.");
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
        action === "CONFIRMED" ? "Approved. It is now for sale." : "Sent back to the seller."
      );
      setActiveItem(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    }
  }

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Quality checks" subtitle="Listings the photo check was not sure about. Open one, look at the photos, and confirm or correct the grade." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Waiting" value={loading ? "…" : String(items.length)} hint="Listings to look at" />
        <StatTile label="Urgent" value={loading ? "…" : String(highPriority.length)} hint="Photo check was least sure" />
        <StatTile label="No grade yet" value={loading ? "…" : String(ungraded.length)} hint="Photos could not be graded" />
      </div>

      <div className="panel-flush">
        <PanelHead title="Waiting for a check" subtitle="Same list the checkers see. Most urgent first." />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Photo-check grade</TableHead>
              <TableHead>How sure</TableHead>
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
                  <TableCell className="capitalize">{item.vertical}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={item.priority} />
                  </TableCell>
                  <TableCell className="font-semibold text-heading">{item.ai_grade ?? "No grade"}</TableCell>
                  <TableCell>
                    {item.ai_confidence !== null ? (
                      <ConfidenceBar value={item.ai_confidence} />
                    ) : (
                      <span className="text-xs text-muted-2">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setActiveItem(item)}>
                      Check
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && sorted.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center text-base whitespace-normal">
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
