"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";

import type { VerificationQueueItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ReviewAction = "CONFIRMED" | "REJECTED";

const ACTIONS: { value: ReviewAction; label: string; icon: typeof IconCheck; notesRequired: boolean }[] = [
  { value: "CONFIRMED", label: "Approve", icon: IconCheck, notesRequired: false },
  { value: "REJECTED", label: "Send back to seller", icon: IconX, notesRequired: true },
];

/**
 * Review flow shared by the admin verification queue and (as the basis for
 * the fuller two-panel page) the verifier queue: confirm, override with
 * notes, or reject with notes. Submits directly to
 * POST /api/verification/queue/{listing_id}/review/ and reports back to the
 * parent only once that succeeds, so the parent's list stays in sync with
 * what's actually persisted.
 */
export function ReviewDialog({
  item,
  open,
  onOpenChange,
  onResolve,
}: {
  item: VerificationQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (item: VerificationQueueItem, action: ReviewAction, notes: string) => void | Promise<void>;
}) {
  const [action, setAction] = useState<ReviewAction>("CONFIRMED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!item) return null;

  const activeAction = ACTIONS.find((a) => a.value === action)!;
  const canSubmit = !activeAction.notesRequired || notes.trim().length > 0;

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    if (!next) {
      setAction("CONFIRMED");
      setNotes("");
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!canSubmit || !item || submitting) return;
    setSubmitting(true);
    try {
      // The parent owns `open` (via `activeItem`) and only clears it on a
      // successful resolve — so a failed submit leaves this dialog open
      // with the entered notes intact, instead of closing either way.
      await onResolve(item, action, notes.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            #{item.listing_id} · {item.commodity_name}
          </DialogTitle>
          <DialogDescription>{item.flagged_reason}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
            <span className="text-[0.9375rem] font-semibold text-body">
              Photo check says: <span className="font-extrabold text-heading">{item.ai_grade ?? "No grade"}</span>
            </span>
            {item.ai_confidence !== null && <ConfidenceBar value={item.ai_confidence} />}
          </div>

          <div className="rounded-xl border border-border">
            {item.attribute_scores.map((score, i) => (
              <div
                key={score.attribute}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3 text-[0.9375rem]",
                  i > 0 && "border-t border-border"
                )}
              >
                <span className="font-semibold text-heading">{score.attribute.replace(/_/g, " ")}</span>
                <ConfidenceBar value={score.ai_confidence} />
              </div>
            ))}
            {item.attribute_scores.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-2">No scores yet.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAction(a.value)}
                className={cn(
                  "flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[0.9375rem] font-bold transition-colors",
                  action === a.value
                    ? "border-brand-primary bg-brand-primary-muted text-brand-primary-hover"
                    : "border-border text-body hover:border-input"
                )}
              >
                <a.icon size={20} />
                {a.label}
              </button>
            ))}
          </div>

          <Field data-invalid={activeAction.notesRequired && notes.trim().length === 0}>
            <FieldLabel htmlFor="review-notes">
              Note for the seller {activeAction.notesRequired ? "(needed)" : "(optional)"}
            </FieldLabel>
            <Textarea
              id="review-notes"
              placeholder={
                action === "REJECTED"
                  ? "What should the seller fix? e.g. add a clear daylight photo."
                  : "Anything to remember about this check…"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" asChild>
            <Link href={`/verifier/queue/${item.listing_id}`}>
              <IconExternalLink />
              See photos & correct scores
            </Link>
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
