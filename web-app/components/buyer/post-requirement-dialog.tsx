"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { ApiError, createRequirement, type Requirement, type Vertical } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  vertical: z.coerce.number().int().positive("Select a vertical"),
  commodity: z.string().min(1, "Required"),
  quantity: z.coerce.number().positive("Must be greater than 0"),
  min_grade: z.string().min(1, "Required"),
  max_price: z.coerce.number().positive("Must be greater than 0"),
  region: z.string().min(1, "Required"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function PostRequirementDialog({
  verticals,
  onCreate,
}: {
  verticals: Vertical[];
  onCreate: (req: Requirement) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error(t("postRequirement.signIn"));
      return;
    }
    try {
      const created = await createRequirement(
        {
          vertical: values.vertical,
          commodity: values.commodity,
          quantity: values.quantity,
          min_grade: values.min_grade,
          max_price: values.max_price,
          region: values.region,
        },
        token
      );
      onCreate(created);
      toast.success(t("postRequirement.posted"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("postRequirement.failed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={verticals.length === 0}>
          <IconPlus />
          {t("postRequirement.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("postRequirement.title")}</DialogTitle>
          <DialogDescription>
            {t("postRequirement.body")}
          </DialogDescription>
        </DialogHeader>

        <form id="requirement-form" onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field data-invalid={!!errors.vertical}>
              <FieldLabel htmlFor="vertical">{t("common.vertical")}</FieldLabel>
              <Controller
                control={control}
                name="vertical"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="vertical" className="w-full">
                      <SelectValue placeholder={t("common.selectVertical")} />
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
              <FieldLabel htmlFor="commodity">{t("common.commodity")}</FieldLabel>
              <Input id="commodity" placeholder={t("postRequirement.commodityPlaceholder")} {...register("commodity")} />
              <FieldError errors={errors.commodity ? [errors.commodity] : undefined} />
            </Field>

            <Field data-invalid={!!errors.quantity}>
              <FieldLabel htmlFor="quantity">{t("common.quantity")}</FieldLabel>
              <Input id="quantity" type="number" step="any" {...register("quantity")} />
              <FieldError errors={errors.quantity ? [errors.quantity] : undefined} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.min_grade}>
                <FieldLabel htmlFor="min_grade">{t("postRequirement.minGrade")}</FieldLabel>
                <Input id="min_grade" placeholder="Grade A" {...register("min_grade")} />
                <FieldError errors={errors.min_grade ? [errors.min_grade] : undefined} />
              </Field>
              <Field data-invalid={!!errors.max_price}>
                <FieldLabel htmlFor="max_price">{t("postRequirement.maxPrice")}</FieldLabel>
                <Input id="max_price" type="number" step="any" {...register("max_price")} />
                <FieldError errors={errors.max_price ? [errors.max_price] : undefined} />
              </Field>
            </div>

            <Field data-invalid={!!errors.region}>
              <FieldLabel htmlFor="region">{t("common.region")}</FieldLabel>
              <Input id="region" placeholder={t("postRequirement.regionPlaceholder")} {...register("region")} />
              <FieldError errors={errors.region ? [errors.region] : undefined} />
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="requirement-form" disabled={isSubmitting}>
            {isSubmitting ? t("postRequirement.posting") : t("postRequirement.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
