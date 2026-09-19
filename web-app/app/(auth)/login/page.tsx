"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
            ? "Incorrect email or password."
            : err.message
          : "Something went wrong. Please try again."
      );
    }
  }

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-8">
      <h1 className="text-xl font-semibold text-heading">Log in</h1>
      <p className="mt-1 text-sm text-body">Welcome back to {"MSME Marketplace"}.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              {...registerField("email")}
            />
            <FieldError errors={errors.email ? [errors.email] : undefined} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand-primary-glow hover:underline"
              >
                Forgot password?
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
            {isSubmitting ? "Logging in…" : "Log in"}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-brand-primary-glow hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
