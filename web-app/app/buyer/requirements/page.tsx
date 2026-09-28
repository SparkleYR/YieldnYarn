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
import { useI18n } from "@/lib/i18n";
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
  const { t, intlLocale } = useI18n();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<number | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError(t("requirements.signIn"));
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
        setError(err instanceof ApiError ? err.message : t("requirements.loadFailed"));
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [t]);

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
            ? t("requirements.matched", { id: result.order_id ?? "" })
            : t("requirements.partial", { id: result.order_id ?? "", shortfall: result.shortfall ?? "" })
        );
      } else if (!silent) {
        toast.info(t("requirements.noMatch"));
      }
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof ApiError ? err.message : t("requirements.matchFailed"));
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
          <h1 className="text-lg font-semibold text-heading">{t("requirements.title")}</h1>
          <p className="mt-1 text-sm text-body">
            {t("requirements.subtitle")}
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
              <TableHead className="pl-5">{t("common.commodity")}</TableHead>
              <TableHead>{t("common.quantity")}</TableHead>
              <TableHead>{t("requirements.minGrade")}</TableHead>
              <TableHead>{t("requirements.maxPrice")}</TableHead>
              <TableHead>{t("common.region")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("requirements.posted")}</TableHead>
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
                    {req.max_price ? `₹${Number(req.max_price).toLocaleString(intlLocale)}` : "—"}
                  </TableCell>
                  <TableCell className="text-body">{req.region || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="text-muted-2">
                    {new Date(req.created_at).toLocaleDateString(intlLocale, {
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
                        {matchingId === req.id ? t("requirements.checking") : t("requirements.checkMatches")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            {!loading && requirements.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-2">
                  {t("requirements.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
