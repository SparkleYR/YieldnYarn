"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import {
  ApiError,
  createPricePoint,
  listPricePoints,
  listVerticals,
  type PricePoint,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatTile } from "@/components/shared/stat-tile";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const schema = z.object({
  vertical: z.coerce.number().int().positive("form.chooseCategory"),
  commodity: z.string().min(1, "form.required"),
  region: z.string().min(1, "form.required"),
  price: z.coerce.number().positive("form.positive"),
  unit: z.string().min(1, "form.required"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const SOURCE_LABELS: Record<string, string> = {
  ADMIN_ENTERED: "Added by hand",
  AGMARKNET: "Mandi feed (Agmarknet)",
  CCI: "Cotton Corporation (CCI)",
};

export default function AdminPricingPage() {
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [entries, setEntries] = useState<PricePoint[]>([]);
  // Totals come from the API's counts: `entries` is only the latest page.
  const [totals, setTotals] = useState({ all: 0, manual: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all"); // "all" | vertical slug
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { unit: "" },
  });

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as an admin to view pricing data.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const [verticalsRes, pricePointsRes, manualRes] = await Promise.all([
        listVerticals(token),
        listPricePoints(token),
        listPricePoints(token, { source: "ADMIN_ENTERED" }),
      ]);
      if (!isCancelled()) {
        setVerticals(verticalsRes.results);
        setEntries(pricePointsRes.results);
        setTotals({ all: pricePointsRes.count, manual: manualRes.count });
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load pricing data.");
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load(() => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const verticalsById = useMemo(
    () => new Map(verticals.map((v) => [v.id, v])),
    [verticals]
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? entries
        : entries.filter((e) => verticalsById.get(e.vertical)?.slug === filter),
    [entries, filter, verticalsById]
  );


  async function onSubmit(values: FormValues) {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as an admin to add a price point.");
      return;
    }
    try {
      const created = await createPricePoint(
        {
          vertical: values.vertical,
          commodity: values.commodity,
          region: values.region,
          price: values.price,
          source: "ADMIN_ENTERED",
          timestamp: new Date().toISOString(),
          raw_data: { unit: values.unit },
        },
        token
      );
      setEntries((prev) => [created, ...prev]);
      setTotals((prev) => ({ all: prev.all + 1, manual: prev.manual + 1 }));
      toast.success("Price point added.");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add price point.");
    }
  }

  function unitFor(entry: PricePoint) {
    const rawUnit = entry.raw_data?.unit;
    if (typeof rawUnit === "string" && rawUnit) return rawUnit;
    return verticalsById.get(entry.vertical)?.unit_of_measure ?? "";
  }

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Market prices"
        subtitle="The prices sellers and buyers see as “today's market price”. Mandi prices arrive automatically; add the rest by hand."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="All prices" value={loading ? "…" : totals.all.toLocaleString("en-IN")} hint="Every price we have" />
        <StatTile label="Added by hand" value={loading ? "…" : totals.manual.toLocaleString("en-IN")} hint="Entered on this page" />
        <StatTile
          label="From the mandi feed"
          value={loading ? "…" : (totals.all - totals.manual).toLocaleString("en-IN")}
          hint="Agmarknet / CCI, updated every 6 hours"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs
          tabs={[{ id: "all", label: "All" }, ...verticals.map((v) => ({ id: v.slug, label: v.name }))]}
          value={filter}
          onChange={setFilter}
        />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={verticals.length === 0}>
              <IconPlus />
              Add a price
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a price</DialogTitle>
              <DialogDescription>
                For crops or products the mandi feed does not cover, such as fabric.
              </DialogDescription>
            </DialogHeader>

            <form id="price-form" onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field data-invalid={!!errors.vertical}>
                  <FieldLabel htmlFor="vertical">Category</FieldLabel>
                  <Controller
                    control={control}
                    name="vertical"
                    render={({ field }) => (
                      <Select
                        value={field.value ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger id="vertical" className="w-full">
                          <SelectValue placeholder="Choose a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {verticals.map((v) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={errors.vertical ? [errors.vertical] : undefined} />
                </Field>

                <Field data-invalid={!!errors.commodity}>
                  <FieldLabel htmlFor="commodity">Crop or product</FieldLabel>
                  <Input id="commodity" placeholder="Cotton Fabric" {...register("commodity")} />
                  <FieldError errors={errors.commodity ? [errors.commodity] : undefined} />
                </Field>

                <Field data-invalid={!!errors.region}>
                  <FieldLabel htmlFor="region">Place (state)</FieldLabel>
                  <Input id="region" placeholder="Surat, Gujarat" {...register("region")} />
                  <FieldError errors={errors.region ? [errors.region] : undefined} />
                </Field>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-3">
                  <Field data-invalid={!!errors.price}>
                    <FieldLabel htmlFor="price">Price (₹)</FieldLabel>
                    <Input id="price" type="number" step="any" {...register("price")} />
                    <FieldError errors={errors.price ? [errors.price] : undefined} />
                  </Field>
                  <Field data-invalid={!!errors.unit}>
                    <FieldLabel htmlFor="unit">Unit</FieldLabel>
                    <Input id="unit" placeholder="meter" {...register("unit")} />
                    <FieldError errors={errors.unit ? [errors.unit] : undefined} />
                  </Field>
                </div>
              </FieldGroup>
            </form>

            <DialogFooter>
              <Button type="submit" form="price-form" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Add price point"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="panel-flush">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Crop or product</TableHead>
              <TableHead>Place</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-border hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              visible.map((entry) => (
                <TableRow key={entry.id} className="border-border">
                  <TableCell className="font-bold text-heading">{entry.commodity}</TableCell>
                  <TableCell>{entry.region}</TableCell>
                  <TableCell className="text-heading">
                    ₹{Number(entry.price).toLocaleString("en-IN")} / {unitFor(entry)}
                  </TableCell>
                  <TableCell>{SOURCE_LABELS[entry.source] ?? entry.source}</TableCell>
                  <TableCell className="text-right text-sm text-muted-2">
                    {new Date(entry.timestamp).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            {!loading && visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center text-base whitespace-normal">
                  No price points yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
