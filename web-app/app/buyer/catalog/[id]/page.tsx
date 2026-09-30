"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconMapPin, IconPhoto, IconShieldCheck, IconUser } from "@tabler/icons-react";

import {
  ApiError,
  getListing,
  listEvidence,
  listGradingResults,
  listVerticals,
  type Evidence,
  type GradingResult,
  type Listing,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommodityIcon } from "@/components/shared/commodity-icon";
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
  const [verticalSlug, setVerticalSlug] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(listingId)) return;
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      try {
        const [result, photos, results, verticals] = await Promise.all([
          getListing(listingId, token),
          // Photos and the grading breakdown are extras: the page still
          // works if either request fails.
          listEvidence(listingId, token).catch(() => [] as Evidence[]),
          listGradingResults(listingId, token).catch(() => [] as GradingResult[]),
          listVerticals(token ?? "").catch(() => null),
        ]);
        if (!cancelled) {
          setListing(result);
          setEvidence(photos.filter((e) => e.file_type === "IMAGE"));
          setGrading(results[0] ?? null);
          setVerticalSlug(verticals?.results.find((v) => v.id === result.vertical)?.slug);
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
      <div className="state-box">
        {error}
      </div>
    );
  }

  if (loading || !listing) {
    return (
      <div className="page">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const price = Number(listing.price_final ?? listing.price_suggested ?? 0);
  const suggested = listing.price_suggested !== null ? Number(listing.price_suggested) : null;
  const gradeAdjustment = suggested !== null ? price - suggested : 0;

  const place =
    listing.region ||
    (listing.location_lat !== null && listing.location_lng !== null
      ? `${listing.location_lat.toFixed(2)}, ${listing.location_lng.toFixed(2)}`
      : "");
  const [cover, ...rest] = evidence;

  return (
    <div className="page">
      <Link href="/buyer/catalog" className="flex w-fit items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline">
        <IconArrowLeft size={18} />
        {t("listing.back")}
      </Link>

      <div className="flex items-start gap-4">
        <CommodityIcon vertical={verticalSlug} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{listing.commodity_name}</h1>
            <StatusBadge status={listing.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-body">
            {listing.sub_category && <span className="font-semibold">{listing.sub_category}</span>}
            {place && (
              <span className="flex items-center gap-1">
                <IconMapPin size={18} className="text-muted-2" />
                {place}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {cover ? (
            <div className="panel flex flex-col gap-3 p-3">
              <a href={cover.file} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the API host */}
                <img src={cover.file} alt={t("listing.photoAlt", { n: 1 })} className="aspect-[4/3] w-full object-cover" />
              </a>
              {rest.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {rest.map((photo, index) => (
                    <a key={photo.id} href={photo.file} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the API host */}
                      <img src={photo.file} alt={t("listing.photoAlt", { n: index + 2 })} className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="state-box aspect-[4/3] border-dashed">
              <IconPhoto size={36} className="text-muted-2" />
              {t("listing.noPhotos")}
            </div>
          )}

          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <h2 className="panel-title">{t("listing.gradingReport")}</h2>
              <Badge className={listing.grade === null ? "bg-muted text-muted-2" : undefined}>
                {listing.grade ?? t("catalog.ungraded")}
              </Badge>
            </div>
            {grading ? (
              <GradingBreakdown result={grading} />
            ) : (
              <p className="mt-3 text-base text-body">{t("listing.notGraded")}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="panel flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold text-muted-2">{t("listing.finalPrice")}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-tight text-heading tabular-nums">
                  ₹{price.toLocaleString(intlLocale)}
                </span>
                <span className="text-base font-semibold text-muted-2">/ {listing.unit}</span>
              </p>
            </div>
            <dl className="flex flex-col gap-2.5 border-y border-border py-4 text-[0.9375rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-body">{t("listing.availableQuantity")}</dt>
                <dd className="font-bold text-heading">
                  {formatQty(listing.quantity, intlLocale)} {listing.unit}
                </dd>
              </div>
              {suggested !== null && gradeAdjustment !== 0 && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-body">{t("common.baseMarketPrice")}</dt>
                    <dd className="font-semibold text-heading">₹{suggested.toLocaleString(intlLocale)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-body">{t("listing.gradeAdjustment")}</dt>
                    <dd className={cn("font-semibold", gradeAdjustment >= 0 ? "text-success" : "text-error")}>
                      {gradeAdjustment >= 0 ? "+" : "−"}₹{Math.abs(gradeAdjustment).toLocaleString(intlLocale)}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-body">
                  <IconUser size={18} className="text-muted-2" />
                  {t("common.seller")}
                </dt>
                <dd className="truncate font-bold text-heading">{listing.seller_name}</dd>
              </div>
            </dl>
            <ListingActions listing={listing} price={price} />
          </div>

          <div className="panel flex items-start gap-3 bg-brand-primary-muted/50">
            <IconShieldCheck size={24} className="mt-0.5 shrink-0 text-brand-primary" />
            <p className="text-sm font-medium text-body">{t("listing.trustNote")}</p>
          </div>
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

/** Per-attribute scores from the latest grading result (AI or verifier), in plain words. */
function GradingBreakdown({ result }: { result: GradingResult }) {
  const { t } = useI18n();
  const entries = Object.entries(result.attribute_scores ?? {});
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-[0.9375rem] text-body">
        {result.source === "VERIFIER" ? t("listing.gradedByVerifier") : t("listing.gradedByAi")}
      </p>
      {entries.map(([name, score]) => {
        const labelKey = ATTRIBUTE_LABELS[name];
        const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
        const tone = pct >= 80 ? "good" : pct >= 60 ? "ok" : "poor";
        return (
          <div key={name}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.9375rem] font-semibold text-heading">
                {labelKey ? t(labelKey) : name.replace(/_/g, " ")}
              </span>
              <span
                className={cn(
                  "text-sm font-bold",
                  tone === "good" ? "text-success" : tone === "ok" ? "text-warning" : "text-error"
                )}
              >
                {t(`attr.level.${tone}`)} · {pct}%
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  tone === "good" ? "bg-success" : tone === "ok" ? "bg-warning" : "bg-error"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {entries.length > 0 && <p className="hint">{t("attr.scoreHelp")}</p>}
    </div>
  );
}
