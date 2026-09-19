"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";

import {
  ApiError,
  getGradingSchema,
  getPricingRule,
  getVertical,
  type GradingSchema,
  type PricingRule,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { VerticalEditor } from "@/components/admin/vertical-editor";
import { Skeleton } from "@/components/ui/skeleton";

export default function VerticalEditorPage() {
  const params = useParams<{ id: string }>();
  const verticalId = Number(params.id);

  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [gradingSchema, setGradingSchema] = useState<GradingSchema | null>(null);
  const [pricingRule, setPricingRule] = useState<PricingRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as an admin to edit verticals.");
          setLoading(false);
        }
        return;
      }
      try {
        const [v, schema, rule] = await Promise.all([
          getVertical(verticalId, token),
          getGradingSchema(verticalId, token),
          getPricingRule(verticalId, token),
        ]);
        if (!cancelled) {
          setVertical(v);
          setGradingSchema(schema);
          setPricingRule(rule);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFoundFlag(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Failed to load vertical.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(verticalId)) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [verticalId]);

  if (notFoundFlag || !Number.isFinite(verticalId)) {
    notFound();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  if (loading || !vertical || !gradingSchema || !pricingRule) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <VerticalEditor vertical={vertical} gradingSchema={gradingSchema} pricingRule={pricingRule} />
  );
}
