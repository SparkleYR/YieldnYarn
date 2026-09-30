"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconCircleCheck } from "@tabler/icons-react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Page-width wrapper shared by every public page (same gutters everywhere). */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("py-16 sm:py-20", className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="text-sm font-bold tracking-wide text-brand-primary uppercase">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-lg text-body">{body}</p>}
    </div>
  );
}

/** Top of a sub-page: big title + one plain sentence. */
export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border bg-card">
      <Container className="py-14 sm:py-16">
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-body sm:text-xl">{subtitle}</p>
      </Container>
    </div>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-base text-body">
          <IconCircleCheck size={22} className="mt-0.5 shrink-0 text-brand-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Closing call to action, identical at the bottom of every public page. */
export function CtaBand() {
  const t = useT();
  return (
    <Section>
      <div className="rounded-3xl bg-brand-primary px-6 py-12 text-center sm:px-12 sm:py-14">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t("site.cta.title")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-white/90">{t("site.cta.body")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="bg-white text-brand-primary-hover hover:bg-white/90">
            <Link href="/register?role=seller">{t("site.hero.sell")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link href="/register?role=buyer">{t("site.hero.buy")}</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
