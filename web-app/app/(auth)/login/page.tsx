"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n";
import { ApiError, getCurrentUser, login } from "@/lib/api";
import { dashboardPathForRole, setSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      const tokens = await login(values);
      const user = await getCurrentUser(tokens.access);
      setSession(tokens, user);
      router.push(dashboardPathForRole(user.role));
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.status === 401
            ? t("auth.login.incorrect")
            : err.message
          : t("common.somethingWrong")
      );
    }
  }

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-8">
      <h1 className="text-xl font-semibold text-heading">{t("auth.login.title")}</h1>
      <p className="mt-1 text-sm text-body">{t("auth.login.welcome")}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              {...registerField("email")}
            />
            <FieldError errors={errors.email ? [errors.email] : undefined} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand-primary-glow hover:underline"
              >
                {t("auth.login.forgot")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...registerField("password")}
            />
            <FieldError errors={errors.password ? [errors.password] : undefined} />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="font-medium text-brand-primary-glow hover:underline">
          {t("auth.login.signUp")}
        </Link>
      </p>
    </div>
  );
}
