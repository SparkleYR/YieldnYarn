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
import { CommodityIcon } from "@/components/shared/commodity-icon";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
    <div className="page">
      <PageHeader
        title="Categories"
        subtitle="Each category has its own quality checks (what the photo check looks at) and price rules (how quality and quantity change the price)."
      />

      {error && (
        <div className="state-box">
          {error}
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {loading &&
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}

          {!loading &&
            verticals.map((vertical) => (
              <Link
                key={vertical.id}
                href={`/admin/verticals/${vertical.id}`}
                className="panel flex h-full flex-col gap-4 transition-colors hover:border-brand-primary/60"
              >
                <div className="flex items-start gap-3">
                  <CommodityIcon vertical={vertical.slug} />
                  <div className="min-w-0 flex-1">
                    <h2 className="panel-title">{vertical.name}</h2>
                    <p className="text-sm text-body">Sold by the {vertical.unit_of_measure}</p>
                  </div>
                  <IconChevronRight size={22} className="mt-1 shrink-0 text-muted-2" />
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm font-semibold text-body">
                  <Badge className={vertical.is_active ? undefined : "bg-muted text-muted-2"}>{vertical.is_active ? "Live" : "Hidden"}</Badge>
                  <span>{vertical.gradingAttributeCount} quality checks</span>
                  <span>{vertical.gradeTierCount} price levels</span>
                </div>
              </Link>
            ))}

          {!loading && verticals.length === 0 && (
            <div className="state-box sm:col-span-2">
              No categories yet. Run <code>python manage.py seed_verticals</code> to add Agriculture and Textiles.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
