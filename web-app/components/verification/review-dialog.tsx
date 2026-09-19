"use client";

import { useState } from "react";
import { IconCheck, IconEdit, IconX } from "@tabler/icons-react";

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

export type ReviewAction = "CONFIRMED" | "OVERRIDDEN" | "REJECTED";

const ACTIONS: { value: ReviewAction; label: string; icon: typeof IconCheck; notesRequired: boolean }[] = [
  { value: "CONFIRMED", label: "Confirm AI grade", icon: IconCheck, notesRequired: false },
  { value: "OVERRIDDEN", label: "Override", icon: IconEdit, notesRequired: true },
  { value: "REJECTED", label: "Reject listing", icon: IconX, notesRequired: true },
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border-muted px-3 py-2">
            <span className="text-xs text-body">AI grade: {item.ai_grade ?? "Ungraded"}</span>
            {item.ai_confidence !== null && <ConfidenceBar value={item.ai_confidence} />}
          </div>

          <div className="rounded-lg border border-border-muted">
            {item.attribute_scores.map((score, i) => (
              <div
                key={score.attribute}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-xs",
                  i > 0 && "border-t border-border-muted"
                )}
              >
                <span className="text-body">{score.attribute}</span>
                <div className="flex items-center gap-3">
                  <span className="text-heading">{score.ai_value}</span>
                  <ConfidenceBar value={score.ai_confidence} />
                </div>
              </div>
            ))}
            {item.attribute_scores.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-2">No attribute scores yet.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAction(a.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                  action === a.value
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary-glow"
                    : "border-border-muted text-body hover:border-brand-primary/40"
                )}
              >
                <a.icon size={16} />
                {a.label}
              </button>
            ))}
          </div>

          <Field data-invalid={activeAction.notesRequired && notes.trim().length === 0}>
            <FieldLabel htmlFor="review-notes">
              Notes {activeAction.notesRequired ? "(required)" : "(optional)"}
            </FieldLabel>
            <Textarea
              id="review-notes"
              placeholder={
                action === "REJECTED"
                  ? "Why is this listing being rejected?"
                  : action === "OVERRIDDEN"
                    ? "What should the grade be, and why?"
                    : "Add a note for the record…"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
