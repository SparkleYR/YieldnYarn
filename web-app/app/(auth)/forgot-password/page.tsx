"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IconCircleCheck } from "@tabler/icons-react";

import { ApiError, requestPasswordReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const schema = z.object({
  email: z.email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center">
        <IconCircleCheck size={32} className="mx-auto text-success" />
        <h1 className="mt-3 text-xl font-semibold text-heading">Check your email</h1>
        <p className="mt-2 text-sm text-body">
          If an account with that email exists, we&apos;ve sent a link to reset your password.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-brand-primary-glow hover:underline"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-8">
      <h1 className="text-xl font-semibold text-heading">Forgot password</h1>
      <p className="mt-1 text-sm text-body">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

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

          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        <Link href="/login" className="font-medium text-brand-primary-glow hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
