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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schema = z.object({
  vertical: z.coerce.number().int().positive("Select a vertical"),
  commodity: z.string().min(1, "Required"),
  region: z.string().min(1, "Required"),
  price: z.coerce.number().positive("Must be greater than 0"),
  unit: z.string().min(1, "Required"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export default function AdminPricingPage() {
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [entries, setEntries] = useState<PricePoint[]>([]);
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
      const [verticalsRes, pricePointsRes] = await Promise.all([
        listVerticals(token),
        listPricePoints(token),
      ]);
      if (!isCancelled()) {
        setVerticals(verticalsRes.results);
        setEntries(pricePointsRes.results);
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

  const manualCount = entries.filter((e) => e.source === "ADMIN_ENTERED").length;

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
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Tracked price points" value={loading ? "…" : String(entries.length)} />
        <StatTile label="Manually entered" value={loading ? "…" : String(manualCount)} />
        <StatTile
          label="Ingested (AGMARKNET/CCI)"
          value={loading ? "…" : String(entries.length - manualCount)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {verticals.map((v) => (
              <TabsTrigger key={v.id} value={v.slug}>
                {v.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={verticals.length === 0}>
              <IconPlus />
              Add price point
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add a price point</DialogTitle>
              <DialogDescription>
                Used for verticals without an automated ingestion job (e.g. textiles).
              </DialogDescription>
            </DialogHeader>

            <form id="price-form" onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field data-invalid={!!errors.vertical}>
                  <FieldLabel htmlFor="vertical">Vertical</FieldLabel>
                  <Controller
                    control={control}
                    name="vertical"
                    render={({ field }) => (
                      <Select
                        value={field.value ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger id="vertical" className="w-full">
                          <SelectValue placeholder="Select a vertical" />
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
                  <FieldLabel htmlFor="commodity">Commodity</FieldLabel>
                  <Input id="commodity" placeholder="Cotton Fabric" {...register("commodity")} />
                  <FieldError errors={errors.commodity ? [errors.commodity] : undefined} />
                </Field>

                <Field data-invalid={!!errors.region}>
                  <FieldLabel htmlFor="region">Region</FieldLabel>
                  <Input id="region" placeholder="Surat, Gujarat" {...register("region")} />
                  <FieldError errors={errors.region ? [errors.region] : undefined} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
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

      <div className="rounded-2xl border border-border-muted bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">Commodity</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="pr-5 text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-border-muted hover:bg-transparent">
                  <TableCell className="pl-5" colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              visible.map((entry) => (
                <TableRow key={entry.id} className="border-border-muted">
                  <TableCell className="pl-5 font-medium text-heading">{entry.commodity}</TableCell>
                  <TableCell className="text-body">{entry.region}</TableCell>
                  <TableCell className="text-heading">
                    ₹{Number(entry.price).toLocaleString("en-IN")} / {unitFor(entry)}
                  </TableCell>
                  <TableCell className="text-body">{entry.source}</TableCell>
                  <TableCell className="pr-5 text-right text-xs text-muted-2">
                    {new Date(entry.timestamp).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            {!loading && visible.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-2">
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
