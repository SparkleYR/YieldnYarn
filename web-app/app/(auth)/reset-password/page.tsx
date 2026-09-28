"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n";
import { ApiError, confirmPasswordReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");
  const t = useT();

  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    if (!uid || !token) return;
    setFormError(null);
    try {
      await confirmPasswordReset(uid, token, values.password);
      router.push("/login");
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.status === 400
            ? t("auth.reset.expired")
            : err.message
          : t("common.somethingWrong")
      );
    }
  }

  if (!uid || !token) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold text-heading">{t("auth.reset.invalidTitle")}</h1>
        <p className="mt-2 text-sm text-body">
          {t("auth.reset.invalidBody")}
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-medium text-brand-primary-glow hover:underline"
        >
          {t("auth.reset.requestNew")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-8">
      <h1 className="text-xl font-semibold text-heading">{t("auth.reset.title")}</h1>
      <p className="mt-1 text-sm text-body">{t("auth.reset.subtitle")}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <FieldGroup>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">{t("auth.reset.newPassword")}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.register.passwordHint")}
              {...registerField("password")}
            />
            <FieldError errors={errors.password ? [errors.password] : undefined} />
          </Field>

          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">{t("auth.reset.confirm")}</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...registerField("confirmPassword")}
            />
            <FieldError errors={errors.confirmPassword ? [errors.confirmPassword] : undefined} />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
