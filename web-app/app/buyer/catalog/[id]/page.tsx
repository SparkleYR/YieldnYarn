"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { IconMapPin } from "@tabler/icons-react";

import {
  ApiError,
  getListing,
  listEvidence,
  listGradingResults,
  type Evidence,
  type GradingResult,
  type Listing,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingActions } from "@/components/buyer/listing-actions";

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = Number(params.id);

  const { t, intlLocale } = useI18n();
  const [listing, setListing] = useState<Listing | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(listingId)) return;
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      try {
        const [result, photos, results] = await Promise.all([
          getListing(listingId, token),
          // Photos and the grading breakdown are extras: the page still
          // works if either request fails.
          listEvidence(listingId, token).catch(() => [] as Evidence[]),
          listGradingResults(listingId, token).catch(() => [] as GradingResult[]),
        ]);
        if (!cancelled) {
          setListing(result);
          setEvidence(photos.filter((e) => e.file_type === "IMAGE"));
          setGrading(results[0] ?? null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setMissing(true);
        } else {
          setError(err instanceof ApiError ? err.message : t("listing.loadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listingId, t]);

  if (missing || !Number.isFinite(listingId)) {
    notFound();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  if (loading || !listing) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const price = Number(listing.price_final ?? listing.price_suggested ?? 0);
  const suggested = listing.price_suggested !== null ? Number(listing.price_suggested) : null;
  const gradeAdjustment = suggested !== null ? price - suggested : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-heading">
            {listing.commodity_name}
            {listing.sub_category && ` — ${listing.sub_category}`}
          </h1>
          <StatusBadge status={listing.status} />
        </div>
        {(listing.region || (listing.location_lat !== null && listing.location_lng !== null)) && (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-2">
            <IconMapPin size={14} />
            {listing.region ||
              `${listing.location_lat?.toFixed(2)}, ${listing.location_lng?.toFixed(2)}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {evidence.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {evidence.map((photo, index) => (
                <a
                  key={photo.id}
                  href={photo.file}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-border-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the API host */}
                  <img
                    src={photo.file}
                    alt={t("listing.photoAlt", { n: index + 1 })}
                    className="aspect-square w-full object-cover"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900/30 via-neutral-900 to-neutral-950">
              <span className="px-6 text-center text-sm text-muted-2">{t("listing.noPhotos")}</span>
            </div>
          )}

          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-heading">{t("listing.gradingReport")}</h2>
              <Badge
                className={
                  listing.grade === null
                    ? "bg-muted text-muted-2"
                    : "bg-brand-primary/15 text-brand-primary-glow"
                }
              >
                {listing.grade ?? t("catalog.ungraded")}
              </Badge>
            </div>
            {grading ? (
              <GradingBreakdown result={grading} />
            ) : listing.grade !== null && listing.grade_confidence !== null ? (
              <p className="mt-3 text-xs text-muted-2">
                {t("listing.modelConfidence", { pct: Math.round(listing.grade_confidence * 100) })}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-2">{t("listing.notGraded")}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <h2 className="text-sm font-semibold text-heading">{t("listing.priceBreakdown")}</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {suggested !== null && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-body">{t("common.baseMarketPrice")}</dt>
                    <dd className="text-heading">₹{suggested.toLocaleString(intlLocale)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-body">{t("listing.gradeAdjustment")}</dt>
                    <dd className={gradeAdjustment >= 0 ? "text-success" : "text-error"}>
                      {gradeAdjustment >= 0 ? "+" : ""}
                      ₹{gradeAdjustment.toLocaleString(intlLocale)}
                    </dd>
                  </div>
                </>
              )}
              <div className="mt-1 flex justify-between border-t border-border-muted pt-2 font-semibold">
                <dt className="text-heading">{t("listing.finalPrice")}</dt>
                <dd className="text-heading">
                  ₹{price.toLocaleString(intlLocale)} / {listing.unit}
                </dd>
              </div>
              <div className="flex justify-between text-xs text-muted-2">
                <dt>{t("listing.availableQuantity")}</dt>
                <dd>
                  {listing.quantity} {listing.unit}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border-muted bg-surface p-5">
            <h2 className="text-sm font-semibold text-heading">{t("common.seller")}</h2>
            <p className="mt-2 text-sm font-medium text-heading">{listing.seller_name}</p>
          </div>

          <ListingActions listing={listing} price={price} />
        </div>
      </div>
    </div>
  );
}

const ATTRIBUTE_LABELS: Record<string, MessageKey> = {
  foreign_matter: "attr.foreign_matter",
  damaged_kernels: "attr.damaged_kernels",
  defect_rate: "attr.defect_rate",
  moisture_content: "attr.moisture_content",
};

/** Per-attribute scores from the latest grading result (AI or verifier). */
function GradingBreakdown({ result }: { result: GradingResult }) {
  const { t } = useI18n();
  const entries = Object.entries(result.attribute_scores ?? {});
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs text-muted-2">
        {result.source === "VERIFIER" ? t("listing.gradedByVerifier") : t("listing.gradedByAi")}
        {result.source === "AI" && result.confidence_score !== null && (
          <> {t("listing.modelConfidence", { pct: Math.round(result.confidence_score * 100) })}</>
        )}
      </p>
      {entries.map(([name, score]) => {
        const labelKey = ATTRIBUTE_LABELS[name];
        const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
        return (
          <div key={name}>
            <div className="flex justify-between text-xs">
              <span className="text-body">
                {labelKey ? t(labelKey) : name.replace(/_/g, " ")}
              </span>
              <span className="text-heading">{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {entries.length > 0 && <p className="text-[11px] text-muted-2">{t("attr.scoreHelp")}</p>}
    </div>
  );
}
