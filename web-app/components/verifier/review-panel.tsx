"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCheck, IconEdit, IconPhoto, IconZoomIn } from "@tabler/icons-react";
import { toast } from "sonner";

import { ApiError, submitVerificationReview, type VerificationQueueItem } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PriorityBadge } from "@/components/shared/status-badge";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Two-panel verifier review: an evidence viewer on the left, AI grading
 * results + a per-attribute override form on the right.
 */
export function VerifierReviewPanel({ item }: { item: VerificationQueueItem }) {
  const router = useRouter();
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasOverrides = Object.values(overrides).some((v) => v.trim() !== "");
  const canOverride = notes.trim().length > 0;

  async function submit(action: "CONFIRMED" | "OVERRIDDEN") {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as a verifier or admin to submit a review.");
      return;
    }
    setSubmitting(true);
    try {
      await submitVerificationReview(
        item.listing_id,
        {
          decision: "APPROVE", // both CONFIRMED and OVERRIDDEN approve the listing
          notes,
          ...(action === "OVERRIDDEN" ? { attribute_scores: overrides } : {}),
        },
        token
      );
      toast.success(action === "CONFIRMED" ? "AI grade confirmed." : "Override submitted.");
      router.push("/verifier/queue");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/verifier/queue"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-2 hover:text-body"
        >
          <IconArrowLeft size={14} />
          Queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-heading">{item.commodity_name}</h1>
          <PriorityBadge priority={item.priority} />
        </div>
        <p className="text-sm text-body">
          {item.seller_name} · {item.flagged_reason}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: evidence viewer */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className={cn(
              "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900/30 via-neutral-900 to-neutral-950 transition-transform",
              zoomed && "scale-[1.03]"
            )}
          >
            <IconPhoto size={40} className="text-white/10" />
            <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 text-xs font-medium text-transparent transition-colors group-hover:bg-black/30 group-hover:text-white">
              <IconZoomIn size={14} />
              {zoomed ? "Zoomed" : "Click to zoom"}
            </span>
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/80">
              Evidence {activeImage + 1} of {item.evidence_image_count}
            </span>
          </button>

          <div className="flex gap-2 overflow-x-auto">
            {Array.from({ length: item.evidence_image_count }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={cn(
                  "flex aspect-square w-16 shrink-0 items-center justify-center rounded-lg border bg-neutral-900 transition-colors",
                  activeImage === i ? "border-brand-primary" : "border-border-muted hover:border-brand-primary/40"
                )}
              >
                <IconPhoto size={16} className="text-white/15" />
              </button>
            ))}
          </div>
        </div>

        {/* Right: AI grading + override form */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-2xl border border-border-muted bg-surface px-4 py-3">
            <span className="text-sm text-body">
              AI grade: <span className="font-medium text-heading">{item.ai_grade ?? "Ungraded"}</span>
            </span>
            {item.ai_confidence !== null && <ConfidenceBar value={item.ai_confidence} />}
          </div>

          <div className="rounded-2xl border border-border-muted bg-surface p-4">
            <h2 className="text-sm font-semibold text-heading">Attribute overrides</h2>
            <div className="mt-3 flex flex-col divide-y divide-border-muted">
              {item.attribute_scores.map((score) => (
                <div key={score.attribute} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5">
                  <div>
                    <p className="text-sm text-body">{score.attribute}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-2">AI: {score.ai_value}</span>
                      <ConfidenceBar value={score.ai_confidence} />
                    </div>
                  </div>
                  <Input
                    placeholder="Override value"
                    value={overrides[score.attribute] ?? ""}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [score.attribute]: e.target.value }))
                    }
                    className="w-32"
                  />
                </div>
              ))}
            </div>
          </div>

          <Field data-invalid={hasOverrides && !canOverride}>
            <FieldLabel htmlFor="verifier-notes">Notes (required to override)</FieldLabel>
            <Textarea
              id="verifier-notes"
              placeholder="Explain the override or confirm your reasoning…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => submit("CONFIRMED")}
              disabled={submitting}
            >
              <IconCheck />
              Confirm AI Grade
            </Button>
            <Button
              className="flex-1"
              onClick={() => submit("OVERRIDDEN")}
              disabled={!canOverride || submitting}
            >
              <IconEdit />
              Submit Override
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
