"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  listRequirements,
  listVerticals,
  triggerRequirementMatch,
  type Requirement,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { PostRequirementDialog } from "@/components/buyer/post-requirement-dialog";
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

export default function RequirementsPage() {
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<number | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as a buyer to view requirements.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const [verticalsRes, requirementsRes] = await Promise.all([
        listVerticals(token),
        listRequirements(token),
      ]);
      if (!isCancelled()) {
        setVerticals(verticalsRes.results);
        setRequirements(requirementsRes.results);
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load requirements.");
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

  async function checkForMatches(requirementId: number, { silent = false } = {}) {
    const token = getStoredTokens()?.access;
    if (!token) return;
    setMatchingId(requirementId);
    try {
      const result = await triggerRequirementMatch(requirementId, token);
      if (result.matched) {
        if (result.requirement_status) {
          setRequirements((prev) =>
            prev.map((r) => (r.id === requirementId ? { ...r, status: result.requirement_status! } : r))
          );
        }
        toast.success(
          result.fully_fulfilled
            ? `Matched — order #${result.order_id} created.`
            : `Partially matched — order #${result.order_id} created (${result.shortfall} still short).`
        );
      } else if (!silent) {
        toast.info(result.detail ?? "No matching listings available yet.");
      }
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof ApiError ? err.message : "Failed to check for matches.");
      }
    } finally {
      setMatchingId(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-heading">My requirements</h1>
          <p className="mt-1 text-sm text-body">
            Post what you need — the matching engine finds sellers for you.
          </p>
        </div>
        <PostRequirementDialog
          verticals={verticals}
          onCreate={(req) => {
            setRequirements((prev) => [req, ...prev]);
            // Fire immediately so "the matching engine finds sellers for
            // you" is true the moment you post, not just eventually true if
            // someone happens to click "Check matches" later.
            checkForMatches(req.id, { silent: true });
          }}
        />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">Commodity</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Min grade</TableHead>
              <TableHead>Max price</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border-muted hover:bg-transparent">
                  <TableCell className="pl-5" colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              requirements.map((req) => (
                <TableRow key={req.id} className="border-border-muted">
                  <TableCell className="pl-5 font-medium text-heading">{req.commodity}</TableCell>
                  <TableCell className="text-body">
                    {req.quantity} {verticalsById.get(req.vertical)?.unit_of_measure ?? ""}
                  </TableCell>
                  <TableCell className="text-body">{req.min_grade || "—"}</TableCell>
                  <TableCell className="text-body">
                    {req.max_price ? `₹${Number(req.max_price).toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                  <TableCell className="text-body">{req.region || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="text-muted-2">
                    {new Date(req.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {req.status === "OPEN" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={matchingId === req.id}
                        onClick={() => checkForMatches(req.id)}
                      >
                        {matchingId === req.id ? "Checking…" : "Check matches"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            {!loading && requirements.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-2">
                  No requirements posted yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
