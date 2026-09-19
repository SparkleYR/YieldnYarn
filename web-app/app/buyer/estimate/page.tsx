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
          date: new Date(p.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
          price: p.price,
        })),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to get an estimate.");
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-heading">Cost estimator</h1>
        <p className="mt-1 text-sm text-body">
          Get a grade-adjusted price estimate before you post a requirement.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-2xl border border-border-muted bg-surface p-5"
        >
          <FieldGroup>
            <Field data-invalid={!!errors.vertical}>
              <FieldLabel htmlFor="vertical">Vertical</FieldLabel>
              {verticalsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Controller
                  control={control}
                  name="vertical"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="vertical" className="w-full">
                        <SelectValue placeholder="Select a vertical" />
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
              <FieldLabel htmlFor="commodity">Commodity</FieldLabel>
              <Input id="commodity" placeholder="Wheat" {...register("commodity")} />
              <FieldError errors={errors.commodity ? [errors.commodity] : undefined} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.quantity}>
                <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
                <Input id="quantity" type="number" step="any" {...register("quantity")} />
                <FieldError errors={errors.quantity ? [errors.quantity] : undefined} />
              </Field>
              <Field>
                <FieldLabel htmlFor="minGrade">Grade (optional)</FieldLabel>
                <Controller
                  control={control}
                  name="minGrade"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="minGrade" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MIN_GRADE}>Any grade</SelectItem>
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
              {isSubmitting ? "Calculating…" : "Get estimate"}
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
              No price data available yet for this commodity in this vertical. An admin needs to
              add a price point first (Admin → Pricing).
            </div>
          )}

          {!error && !notFound && estimate ? (
            <div className="rounded-2xl border border-border-muted bg-surface p-5">
              <p className="text-xs font-medium tracking-wide text-muted-2 uppercase">
                Estimated total
              </p>
              <p className="mt-1 text-3xl font-semibold text-heading">
                ₹{estimate.total.toLocaleString("en-IN")}
              </p>
              <dl className="mt-4 flex flex-col gap-2 text-sm">
                {estimate.basePrice !== null && (
                  <div className="flex justify-between">
                    <dt className="text-body">Base market price</dt>
                    <dd className="text-heading">₹{estimate.basePrice.toLocaleString("en-IN")}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-body">Grade & quantity-adjusted unit price</dt>
                  <dd className="text-heading">
                    ₹{estimate.unitPrice.toLocaleString("en-IN")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-body">Quantity</dt>
                  <dd className="text-heading">{estimate.quantity}</dd>
                </div>
              </dl>

              {estimate.trend.length > 0 ? (
                <>
                  <p className="mt-5 text-xs font-medium tracking-wide text-muted-2 uppercase">
                    30-day price trend — {estimate.commodity}
                  </p>
                  <PriceTrendChart data={estimate.trend} className="mt-2" />
                </>
              ) : (
                <p className="mt-5 text-xs text-muted-2">
                  No price history in the last 30 days to chart yet.
                </p>
              )}
            </div>
          ) : (
            !error &&
            !notFound && (
              <div className="flex h-full min-h-52 items-center justify-center rounded-2xl border border-dashed border-border-muted p-8 text-center text-sm text-muted-2">
                Fill in the form to see a grade-adjusted estimate and price trend.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
