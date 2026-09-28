"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  ApiError,
  getBasePrice,
  getPriceEstimate,
  getPriceTrends,
  listVerticals,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PriceTrendChart, type PriceTrendPoint } from "@/components/shared/price-trend-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_MIN_GRADE = "__any__";

const schema = z.object({
  vertical: z.string().min(1, "Select a vertical"),
  commodity: z.string().min(1, "Required"),
  quantity: z.coerce.number().positive("Must be greater than 0"),
  minGrade: z.string(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

interface Estimate {
  basePrice: number | null;
  unitPrice: number;
  total: number;
  quantity: number;
  commodity: string;
  trend: PriceTrendPoint[];
}

export default function EstimatePage() {
  const { t, intlLocale } = useI18n();
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [verticalsLoading, setVerticalsLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { minGrade: NO_MIN_GRADE },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) setVerticalsLoading(false);
        return;
      }
      try {
        const res = await listVerticals(token);
        if (!cancelled) setVerticals(res.results);
      } finally {
        if (!cancelled) setVerticalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: FormValues) {
    setError(null);
    setNotFound(false);
    setEstimate(null);
    const minGrade = values.minGrade === NO_MIN_GRADE ? undefined : values.minGrade;
    try {
      const [baseRes, estimateRes, trendsRes] = await Promise.all([
        getBasePrice(values.vertical, values.commodity).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
        getPriceEstimate({
          vertical: values.vertical,
          commodity: values.commodity,
          quantity: values.quantity,
          min_grade: minGrade,
        }),
        getPriceTrends(values.vertical, values.commodity, 30),
      ]);

      setEstimate({
        basePrice: baseRes?.base_price ?? null,
        unitPrice: estimateRes.unit_price,
        total: estimateRes.estimated_total,
        quantity: values.quantity,
        commodity: values.commodity,
        trend: trendsRes.points.map((p) => ({
          date: new Date(p.timestamp).toLocaleDateString(intlLocale, { day: "2-digit", month: "short" }),
          price: p.price,
        })),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : t("estimate.failed"));
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-heading">{t("estimate.title")}</h1>
        <p className="mt-1 text-sm text-body">
          {t("estimate.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-2xl border border-border-muted bg-surface p-5"
        >
          <FieldGroup>
            <Field data-invalid={!!errors.vertical}>
              <FieldLabel htmlFor="vertical">{t("common.vertical")}</FieldLabel>
              {verticalsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Controller
                  control={control}
                  name="vertical"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="vertical" className="w-full">
                        <SelectValue placeholder={t("common.selectVertical")} />
                      </SelectTrigger>
                      <SelectContent>
                        {verticals.map((v) => (
                          <SelectItem key={v.id} value={v.slug}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              <FieldError errors={errors.vertical ? [errors.vertical] : undefined} />
            </Field>

            <Field data-invalid={!!errors.commodity}>
              <FieldLabel htmlFor="commodity">{t("common.commodity")}</FieldLabel>
              <Input id="commodity" placeholder={t("postRequirement.commodityPlaceholder")} {...register("commodity")} />
              <FieldError errors={errors.commodity ? [errors.commodity] : undefined} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.quantity}>
                <FieldLabel htmlFor="quantity">{t("common.quantity")}</FieldLabel>
                <Input id="quantity" type="number" step="any" {...register("quantity")} />
                <FieldError errors={errors.quantity ? [errors.quantity] : undefined} />
              </Field>
              <Field>
                <FieldLabel htmlFor="minGrade">{t("estimate.gradeOptional")}</FieldLabel>
                <Controller
                  control={control}
                  name="minGrade"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="minGrade" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MIN_GRADE}>{t("common.anyGrade")}</SelectItem>
                        <SelectItem value="Grade A">Grade A</SelectItem>
                        <SelectItem value="Grade B">Grade B</SelectItem>
                        <SelectItem value="Grade C">Grade C</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Button type="submit" disabled={isSubmitting || verticalsLoading} className="mt-2">
              {isSubmitting ? t("estimate.calculating") : t("estimate.submit")}
            </Button>
          </FieldGroup>
        </form>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="flex h-full min-h-52 items-center justify-center rounded-2xl border border-dashed border-error/40 p-8 text-center text-sm text-error">
              {error}
            </div>
          )}

          {!error && notFound && (
            <div className="flex h-full min-h-52 items-center justify-center rounded-2xl border border-dashed border-border-muted p-8 text-center text-sm text-body">
              {t("estimate.noData")}
            </div>
          )}

          {!error && !notFound && estimate ? (
            <div className="rounded-2xl border border-border-muted bg-surface p-5">
              <p className="text-xs font-medium tracking-wide text-muted-2 uppercase">
                {t("estimate.total")}
              </p>
              <p className="mt-1 text-3xl font-semibold text-heading">
                ₹{estimate.total.toLocaleString(intlLocale)}
              </p>
              <dl className="mt-4 flex flex-col gap-2 text-sm">
                {estimate.basePrice !== null && (
                  <div className="flex justify-between">
                    <dt className="text-body">{t("common.baseMarketPrice")}</dt>
                    <dd className="text-heading">₹{estimate.basePrice.toLocaleString(intlLocale)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-body">{t("estimate.adjustedUnit")}</dt>
                  <dd className="text-heading">
                    ₹{estimate.unitPrice.toLocaleString(intlLocale)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-body">{t("common.quantity")}</dt>
                  <dd className="text-heading">{estimate.quantity}</dd>
                </div>
              </dl>

              {estimate.trend.length > 0 ? (
                <>
                  <p className="mt-5 text-xs font-medium tracking-wide text-muted-2 uppercase">
                    {t("estimate.trend", { commodity: estimate.commodity })}
                  </p>
                  <PriceTrendChart data={estimate.trend} className="mt-2" />
                </>
              ) : (
                <p className="mt-5 text-xs text-muted-2">
                  {t("estimate.noHistory")}
                </p>
              )}
            </div>
          ) : (
            !error &&
            !notFound && (
              <div className="flex h-full min-h-52 items-center justify-center rounded-2xl border border-dashed border-border-muted p-8 text-center text-sm text-muted-2">
                {t("estimate.empty")}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
