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

function makeSchema(t: ReturnType<typeof useT>) {
  return z.object({
    email: z.email(t("form.emailInvalid")),
    password: z.string().min(1, t("form.passwordRequired")),
  });
}

type LoginValues = z.infer<ReturnType<typeof makeSchema>>;

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(makeSchema(t)) });

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
    <div className="panel sm:p-8">
      <h1 className="page-title">{t("auth.login.title")}</h1>
      <p className="page-subtitle">{t("auth.login.welcome")}</p>

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
                className="text-sm font-semibold text-brand-primary hover:underline"
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
            <p role="alert" className="rounded-xl bg-error/10 px-3.5 py-2.5 text-sm font-semibold text-error">
              {formError}
            </p>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-[0.9375rem] text-body">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="font-bold text-brand-primary hover:underline">
          {t("auth.login.signUp")}
        </Link>
      </p>
    </div>
  );
}
