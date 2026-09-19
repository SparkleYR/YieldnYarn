"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";

import {
  ApiError,
  getGradingSchema,
  getPricingRule,
  listVerticals,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

interface VerticalSummary extends Vertical {
  gradingAttributeCount: number;
  gradeTierCount: number;
}

export default function AdminVerticalsPage() {
  const [verticals, setVerticals] = useState<VerticalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as an admin to view verticals.");
          setLoading(false);
        }
        return;
      }
      try {
        const { results } = await listVerticals(token);
        const summaries = await Promise.all(
          results.map(async (v) => {
            const [schema, rule] = await Promise.all([
              getGradingSchema(v.id, token),
              getPricingRule(v.id, token),
            ]);
            return {
              ...v,
              gradingAttributeCount: schema.attributes.length,
              gradeTierCount: rule.rules?.grade_adjustment_table?.length ?? 0,
            };
          })
        );
        if (!cancelled) setVerticals(summaries);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load verticals.");
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-heading">Verticals</h1>
        <p className="text-sm text-body">
          Grading schemas and pricing rules that drive listings in each vertical.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
          {error}
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {loading &&
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}

          {!loading &&
            verticals.map((vertical) => (
              <Link
                key={vertical.id}
                href={`/admin/verticals/${vertical.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-brand-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-heading">{vertical.name}</h2>
                    <p className="mt-1 text-xs text-body">Unit: {vertical.unit_of_measure}</p>
                  </div>
                  <IconChevronRight size={16} className="mt-0.5 shrink-0 text-muted-2" />
                </div>
                <div className="flex items-center gap-4 border-t border-border-muted pt-3 text-xs text-body">
                  <StatusBadge status={vertical.is_active ? "ACTIVE" : "DRAFT"} />
                  <span>{vertical.gradingAttributeCount} grading attributes</span>
                  <span>{vertical.gradeTierCount} grade tiers</span>
                </div>
              </Link>
            ))}

          {!loading && verticals.length === 0 && (
            <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-muted-2 sm:col-span-2">
              No verticals configured yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
