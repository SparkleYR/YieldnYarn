"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n";
import { ApiError, getCurrentUser, login, register as registerUser } from "@/lib/api";
import { dashboardPathForRole, setSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const registerSchema = z.object({
  display_name: z.string().min(1, "Enter your name"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["BUYER", "SELLER"]),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: searchParams.get("plan") ? "SELLER" : "BUYER",
    },
  });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    try {
      await registerUser(values);
      const tokens = await login({ email: values.email, password: values.password });
      const user = await getCurrentUser(tokens.access);
      setSession(tokens, user);
      router.push(dashboardPathForRole(user.role));
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : t("common.somethingWrong")
      );
    }
  }

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-8">
      <h1 className="text-xl font-semibold text-heading">{t("auth.register.title")}</h1>
      <p className="mt-1 text-sm text-body">{t("auth.register.subtitle")}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <FieldGroup>
          <Field data-invalid={!!errors.display_name}>
            <FieldLabel htmlFor="display_name">{t("auth.register.fullName")}</FieldLabel>
            <Input
              id="display_name"
              autoComplete="name"
              placeholder={t("auth.register.fullNamePlaceholder")}
              {...registerField("display_name")}
            />
            <FieldError errors={errors.display_name ? [errors.display_name] : undefined} />
          </Field>

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
            <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.register.passwordHint")}
              {...registerField("password")}
            />
            <FieldError errors={errors.password ? [errors.password] : undefined} />
          </Field>

          <Field data-invalid={!!errors.role}>
            <FieldLabel htmlFor="role">{t("auth.register.role")}</FieldLabel>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue placeholder={t("auth.register.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUYER">{t("auth.register.buyer")}</SelectItem>
                    <SelectItem value="SELLER">{t("auth.register.seller")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={errors.role ? [errors.role] : undefined} />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-primary-glow hover:underline">
          {t("auth.register.login")}
        </Link>
      </p>
    </div>
  );
}
