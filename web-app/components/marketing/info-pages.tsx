"use client";

import type { ElementType } from "react";
import { IconBuildingStore, IconNeedleThread, IconShoppingCart, IconWheat } from "@tabler/icons-react";

import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { CheckList, CtaBand, PageIntro, Section } from "@/components/marketing/marketing-ui";

/** /verticals — what can be sold, and what is checked for each. */
export function SellPage() {
  const t = useT();
  const categories: {
    icon: ElementType;
    tone: string;
    title: MessageKey;
    body: MessageKey;
    examples: MessageKey;
    checks: MessageKey[];
  }[] = [
    {
      icon: IconWheat,
      tone: "bg-warning/10 text-warning",
      title: "site.sell.grain.title",
      body: "site.sell.grain.body",
      examples: "site.sellPage.grainExamples",
      checks: ["site.sellPage.grainCheck1", "site.sellPage.grainCheck2", "site.sellPage.grainCheck3"],
    },
    {
      icon: IconNeedleThread,
      tone: "bg-info/10 text-info",
      title: "site.sell.cloth.title",
      body: "site.sell.cloth.body",
      examples: "site.sellPage.clothExamples",
      checks: ["site.sellPage.clothCheck1", "site.sellPage.clothCheck2", "site.sellPage.clothCheck3"],
    },
  ];
  return (
    <>
      <PageIntro title={t("site.sellPage.title")} subtitle={t("site.sellPage.subtitle")} />
      <Section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {categories.map(({ icon: Icon, tone, title, body, examples, checks }) => (
            <div key={title} className="panel flex h-full flex-col gap-5 p-6">
              <span className={`flex size-14 items-center justify-center rounded-2xl ${tone}`}>
                <Icon size={30} stroke={1.8} />
              </span>
              <div>
                <h2 className="text-2xl font-bold text-heading">{t(title)}</h2>
                <p className="mt-2 text-base text-body">{t(body)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-4">
                <p className="text-sm font-bold text-muted-2">{t("site.sellPage.examples")}</p>
                <p className="mt-1 text-base font-semibold text-heading">{t(examples)}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-muted-2">{t("site.sellPage.checks")}</p>
                <CheckList className="mt-3" items={checks.map((key) => t(key))} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-lg text-body">{t("site.sellPage.more")}</p>
      </Section>
      <CtaBand />
    </>
  );
}

/** /services — the steps for sellers and for buyers, and what grades mean. */
export function HowPage() {
  const t = useT();
  const columns: { icon: ElementType; title: MessageKey; steps: MessageKey[] }[] = [
    { icon: IconBuildingStore, title: "site.howPage.sellers", steps: ["site.howPage.s1", "site.howPage.s2", "site.howPage.s3", "site.howPage.s4"] },
    { icon: IconShoppingCart, title: "site.howPage.buyers", steps: ["site.howPage.b1", "site.howPage.b2", "site.howPage.b3", "site.howPage.b4"] },
  ];
  return (
    <>
      <PageIntro title={t("site.howPage.title")} subtitle={t("site.howPage.subtitle")} />
      <Section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {columns.map(({ icon: Icon, title, steps }) => (
            <div key={title} className="panel flex h-full flex-col gap-5 p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-xl bg-brand-primary-muted text-brand-primary">
                  <Icon size={24} />
                </span>
                <h2 className="text-2xl font-bold text-heading">{t(title)}</h2>
              </div>
              <ol className="flex flex-col gap-4">
                {steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-base text-body">{t(step)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Section>
      <Section className="bg-card">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-heading">{t("site.howPage.gradesTitle")}</h2>
        <GradeCards />
      </Section>
      <CtaBand />
    </>
  );
}

function GradeCards() {
  const t = useT();
  const grades: { letter: string; tone: string; body: MessageKey }[] = [
    { letter: "A", tone: "bg-success/10 text-success", body: "site.howPage.gradeA" },
    { letter: "B", tone: "bg-info/10 text-info", body: "site.howPage.gradeB" },
    { letter: "C", tone: "bg-warning/10 text-warning", body: "site.howPage.gradeC" },
  ];
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
      {grades.map(({ letter, tone, body }) => (
        <div key={letter} className="panel flex h-full flex-col gap-3 p-6">
          <span className={`flex size-14 items-center justify-center rounded-2xl text-2xl font-extrabold ${tone}`}>{letter}</span>
          <p className="text-lg font-bold text-heading">Grade {letter}</p>
          <p className="text-base text-body">{t(body)}</p>
        </div>
      ))}
    </div>
  );
}

/** /blog — short practical guides (photos, grades, price, problems). */
export function GuidesPage() {
  const t = useT();
  const guides: { title: MessageKey; items: MessageKey[] }[] = [
    { title: "site.guides.photos.title", items: ["site.guides.photos.1", "site.guides.photos.2", "site.guides.photos.3", "site.guides.photos.4"] },
    { title: "site.guides.price.title", items: ["site.guides.price.1", "site.guides.price.2", "site.guides.price.3", "site.guides.price.4"] },
    { title: "site.guides.problem.title", items: ["site.guides.problem.1", "site.guides.problem.2", "site.guides.problem.3"] },
  ];
  return (
    <>
      <PageIntro title={t("site.guides.title")} subtitle={t("site.guides.subtitle")} />
      <Section>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {guides.map(({ title, items }) => (
            <article key={title} className="panel flex h-full flex-col gap-4 p-6">
              <h2 className="text-xl font-bold text-heading">{t(title)}</h2>
              <CheckList items={items.map((key) => t(key))} />
            </article>
          ))}
        </div>
      </Section>
      <Section className="bg-card">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-heading">{t("site.guides.grades.title")}</h2>
        <GradeCards />
      </Section>
      <CtaBand />
    </>
  );
}

/** /pricing — it's free; no invented plans. */
export function PricingPage() {
  const t = useT();
  const items: MessageKey[] = ["site.pricing.1", "site.pricing.2", "site.pricing.3", "site.pricing.4", "site.pricing.5"];
  return (
    <>
      <PageIntro title={t("site.pricing.title")} subtitle={t("site.pricing.subtitle")} />
      <Section>
        <div className="panel mx-auto flex max-w-2xl flex-col gap-6 p-8">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-extrabold tracking-tight text-heading">₹0</span>
            <span className="rounded-full bg-brand-primary-muted px-3 py-1 text-sm font-bold text-brand-primary-hover">
              {t("site.pricing.free")}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-muted-2">{t("site.pricing.what")}</p>
            <CheckList className="mt-3" items={items.map((key) => t(key))} />
          </div>
          <p className="border-t border-border pt-5 text-base text-body">{t("site.pricing.note")}</p>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
