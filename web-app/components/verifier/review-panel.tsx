"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCheck, IconExternalLink, IconPhoto, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import {
  ApiError,
  listEvidence,
  submitVerificationReview,
  type Evidence,
  type VerificationQueueItem,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/shared/status-badge";
import { ConfidenceBar } from "@/components/shared/confidence-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const LABELS: Record<string, string> = {
  foreign_matter: "Clean (no dust, stones or husk)",
  damaged_kernels: "Whole grains (not broken or damaged)",
  defect_rate: "No holes, stains or loose threads",
  moisture_content: "Dry enough",
};

/**
 * Checker's page: the seller's photos on the left; the photo check's scores,
 * optional corrections and approve / send back on the right.
 */
export function VerifierReviewPanel({ item }: { item: VerificationQueueItem }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Evidence[] | null>(null);
  const [active, setActive] = useState(0);
  // Corrections are typed as 0–100 (%) and sent as 0–1.
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getStoredTokens()?.access;
    let cancelled = false;
    listEvidence(item.listing_id, token)
      .then((files) => !cancelled && setPhotos(files.filter((f) => f.file_type === "IMAGE")))
      .catch(() => !cancelled && setPhotos([]));
    return () => {
      cancelled = true;
    };
  }, [item.listing_id]);

  const corrected = Object.entries(corrections).filter(([, v]) => v.trim() !== "");
  const invalid = corrected.some(([, v]) => {
    const n = Number(v);
    return Number.isNaN(n) || n < 0 || n > 100;
  });
  const hasNote = notes.trim().length > 0;

  async function submit(decision: "APPROVE" | "REJECT") {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("Please log in again to save your check.");
      return;
    }
    setSubmitting(true);
    try {
      await submitVerificationReview(
        item.listing_id,
        {
          decision,
          notes: notes.trim(),
          ...(decision === "APPROVE" && corrected.length > 0
            ? { attribute_scores: Object.fromEntries(corrected.map(([k, v]) => [k, Number(v) / 100])) }
            : {}),
        },
        token
      );
      toast.success(decision === "REJECT" ? "Sent back to the seller." : "Approved. It is now for sale.");
      router.push("/verifier/queue");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const current = photos?.[active];

  return (
    <div className="page">
      <Link href="/verifier/queue" className="flex w-fit items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline">
        <IconArrowLeft size={18} />
        Photos to check
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="page-title">{item.commodity_name}</h1>
          <PriorityBadge priority={item.priority} />
        </div>
        <p className="page-subtitle">
          From {item.seller_name}. {item.flagged_reason}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="panel flex flex-col gap-3 p-3">
          {photos === null ? (
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          ) : current ? (
            <a href={current.file} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the API host */}
              <img src={current.file} alt={`Photo ${active + 1}`} className="aspect-[4/3] w-full object-cover" />
              <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-sm font-bold text-heading shadow">
                <IconExternalLink size={16} />
                Open full size
              </span>
            </a>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-muted text-base font-semibold text-body">
              <IconPhoto size={36} className="text-muted-2" />
              The seller has not added photos. Send it back and ask for photos.
            </div>
          )}
          {photos && photos.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={cn(
                    "overflow-hidden rounded-lg border-2 transition-colors",
                    active === i ? "border-brand-primary" : "border-transparent hover:border-input"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the API host */}
                  <img src={photo.file} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel flex flex-wrap items-center justify-between gap-3">
            <span className="text-base font-semibold text-body">
              Photo check says: <span className="font-extrabold text-heading">{item.ai_grade ?? "No grade"}</span>
            </span>
            {item.ai_confidence !== null && (
              <span className="flex items-center gap-2 text-sm font-semibold text-muted-2">
                How sure <ConfidenceBar value={item.ai_confidence} />
              </span>
            )}
          </div>

          <div className="panel">
            <h2 className="panel-title">Quality scores</h2>
            <p className="panel-subtitle">100% means no problem. Type a new % only where you disagree.</p>
            <div className="mt-3 flex flex-col divide-y divide-border">
              {item.attribute_scores.map((score) => (
                <div key={score.attribute} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-bold text-heading">{LABELS[score.attribute] ?? score.attribute}</p>
                    <ConfidenceBar value={score.ai_confidence} className="mt-1.5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Correct score for ${LABELS[score.attribute] ?? score.attribute}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      placeholder="Your %"
                      value={corrections[score.attribute] ?? ""}
                      onChange={(e) => setCorrections((prev) => ({ ...prev, [score.attribute]: e.target.value }))}
                      className="w-28"
                    />
                    <span className="text-sm font-bold text-muted-2">%</span>
                  </div>
                </div>
              ))}
              {item.attribute_scores.length === 0 && (
                <p className="py-4 text-base text-body">No scores yet. Judge from the photos.</p>
              )}
            </div>
            {invalid && <p className="mt-2 text-sm font-semibold text-error">Use numbers from 0 to 100.</p>}
          </div>

          <Field>
            <FieldLabel htmlFor="verifier-notes">Note for the seller</FieldLabel>
            <Textarea
              id="verifier-notes"
              placeholder="e.g. Please add a clear photo of the whole sample in daylight."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <FieldDescription>Needed when you correct a score or send it back.</FieldDescription>
          </Field>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              onClick={() => submit("APPROVE")}
              disabled={submitting || invalid || (corrected.length > 0 && !hasNote)}
            >
              <IconCheck />
              {corrected.length > 0 ? "Approve with my scores" : "Approve"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-error hover:bg-error/5 hover:text-error"
              onClick={() => submit("REJECT")}
              disabled={submitting || !hasNote}
            >
              <IconX />
              Send back to seller
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
