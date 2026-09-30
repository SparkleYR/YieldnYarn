"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { IconBuildingStore, IconShoppingCart } from "@tabler/icons-react";
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
import { cn } from "@/lib/utils";

function makeSchema(t: ReturnType<typeof useT>) {
  return z.object({
    display_name: z.string().min(1, t("form.nameRequired")),
    email: z.email(t("form.emailInvalid")),
    password: z.string().min(8, t("auth.register.passwordHint")),
    role: z.enum(["BUYER", "SELLER"]),
  });
}

type RegisterValues = z.infer<ReturnType<typeof makeSchema>>;

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
    resolver: zodResolver(makeSchema(t)),
    defaultValues: {
      // /register?role=seller from the "I want to sell" buttons on the site.
      role: searchParams.get("role") === "seller" || searchParams.get("plan") ? "SELLER" : "BUYER",
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
    <div className="panel sm:p-8">
      <h1 className="page-title">{t("auth.register.title")}</h1>
      <p className="page-subtitle">{t("auth.register.subtitle")}</p>

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
            <FieldLabel id="role-label">{t("auth.register.role")}</FieldLabel>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="role-label" className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { value: "SELLER", icon: IconBuildingStore, title: t("auth.register.seller"), body: t("auth.register.sellerHint") },
                      { value: "BUYER", icon: IconShoppingCart, title: t("auth.register.buyer"), body: t("auth.register.buyerHint") },
                    ] as const
                  ).map(({ value, icon: Icon, title, body }) => {
                    const selected = field.value === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          "flex h-full flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors",
                          selected
                            ? "border-brand-primary bg-brand-primary-muted"
                            : "border-border bg-card hover:border-input"
                        )}
                      >
                        <Icon size={24} className={selected ? "text-brand-primary" : "text-muted-2"} />
                        <span className="text-base font-bold text-heading">{title}</span>
                        <span className="text-sm text-body">{body}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
            <FieldError errors={errors.role ? [errors.role] : undefined} />
          </Field>

          {formError && (
            <p role="alert" className="rounded-xl bg-error/10 px-3.5 py-2.5 text-sm font-semibold text-error">
              {formError}
            </p>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-[0.9375rem] text-body">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-bold text-brand-primary hover:underline">
          {t("auth.register.login")}
        </Link>
      </p>
    </div>
  );
}
