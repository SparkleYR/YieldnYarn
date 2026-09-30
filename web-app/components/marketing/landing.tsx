"use client";

import Link from "next/link";
import type { ElementType } from "react";
import {
  IconCamera,
  IconCircleCheck,
  IconCurrencyRupee,
  IconHeadset,
  IconMapPin,
  IconNeedleThread,
  IconRosetteDiscountCheck,
  IconShieldCheck,
  IconTruckDelivery,
  IconUsers,
  IconWheat,
} from "@tabler/icons-react";

import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Container, CtaBand, Section, SectionHeading } from "@/components/marketing/marketing-ui";

export function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhatYouCanSell />
      <Why />
      <ForBuyers />
      <Faq />
      <CtaBand />
    </>
  );
}

function Hero() {
  const t = useT();
  return (
    <section className="border-b border-border bg-card">
      <Container className="grid grid-cols-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-primary-muted px-3.5 py-1.5 text-sm font-bold text-brand-primary-hover">
            <IconWheat size={18} />
            {t("site.hero.badge")}
          </p>
          <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-heading sm:text-5xl lg:text-6xl">
            {t("site.hero.title")}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-body sm:text-xl">{t("site.hero.subtitle")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="sm:min-w-44">
              <Link href="/register?role=seller">{t("site.hero.sell")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="sm:min-w-44">
              <Link href="/register?role=buyer">{t("site.hero.buy")}</Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            {(["site.hero.point1", "site.hero.point2", "site.hero.point3"] as const).map((key) => (
              <li key={key} className="flex items-center gap-2 text-[0.9375rem] font-semibold text-body">
                <IconCircleCheck size={20} className="text-brand-primary" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <ListingPreview />
      </Container>
    </section>
  );
}

/** A static example listing, drawn with the app's own styles — not a screenshot. */
function ListingPreview() {
  const t = useT();
  const bars: [MessageKey, number][] = [
    ["attr.foreign_matter", 94],
    ["attr.damaged_kernels", 90],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="panel flex flex-col gap-5 p-6 shadow-xl shadow-black/5">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <IconWheat size={26} stroke={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-heading">Wheat · Sharbati</p>
            <p className="flex items-center gap-1 text-sm text-body">
              <IconMapPin size={16} className="text-muted-2" />
              Madhya Pradesh
            </p>
          </div>
          <span className="rounded-full bg-brand-primary-muted px-2.5 py-1 text-xs font-bold text-brand-primary-hover">Grade A</span>
        </div>
        <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/60 p-4">
          <div>
            <p className="text-sm font-semibold text-muted-2">{t("listing.finalPrice")}</p>
            <p className="text-3xl font-extrabold tracking-tight text-heading">
              ₹2,450<span className="text-base font-semibold text-muted-2"> / quintal</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-muted-2">{t("site.preview.mandi")}</p>
            <p className="text-lg font-bold text-heading">₹2,400</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {bars.map(([key, pct]) => (
            <div key={key}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold text-heading">{t(key)}</span>
                <span className="font-bold text-success">{pct}%</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 border-t border-border pt-4 text-[0.9375rem] font-bold text-brand-primary">
          <IconUsers size={20} />
          {t("site.preview.offers")}
        </p>
      </div>
      <span className="absolute -top-3 left-6 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-2 shadow-sm">
        {t("site.preview.example")}
      </span>
    </div>
  );
}

function HowItWorks() {
  const t = useT();
  const steps: { icon: ElementType; title: MessageKey; body: MessageKey }[] = [
    { icon: IconCamera, title: "site.how.step1.title", body: "site.how.step1.body" },
    { icon: IconRosetteDiscountCheck, title: "site.how.step2.title", body: "site.how.step2.body" },
    { icon: IconCurrencyRupee, title: "site.how.step3.title", body: "site.how.step3.body" },
  ];
  return (
    <Section id="how">
      <SectionHeading eyebrow={t("site.how.eyebrow")} title={t("site.how.title")} />
      <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="panel flex h-full flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-brand-primary text-white">
                <Icon size={24} />
              </span>
              <span className="text-sm font-bold text-muted-2">{i + 1} / 3</span>
            </div>
            <h3 className="text-xl font-bold text-heading">{t(title)}</h3>
            <p className="text-base text-body">{t(body)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function WhatYouCanSell() {
  const t = useT();
  const cards = [
    { icon: IconWheat, tone: "bg-warning/10 text-warning", title: "site.sell.grain.title", body: "site.sell.grain.body", checks: "site.sell.grain.checks" },
    { icon: IconNeedleThread, tone: "bg-info/10 text-info", title: "site.sell.cloth.title", body: "site.sell.cloth.body", checks: "site.sell.cloth.checks" },
  ] as const;
  return (
    <Section className="bg-card">
      <SectionHeading eyebrow={t("site.sell.eyebrow")} title={t("site.sell.title")} />
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map(({ icon: Icon, tone, title, body, checks }) => (
          <Link key={title} href="/verticals" className="panel flex h-full flex-col gap-4 p-6 transition-colors hover:border-brand-primary/60">
            <span className={`flex size-14 items-center justify-center rounded-2xl ${tone}`}>
              <Icon size={30} stroke={1.8} />
            </span>
            <h3 className="text-2xl font-bold text-heading">{t(title)}</h3>
            <p className="text-base text-body">{t(body)}</p>
            <p className="mt-auto rounded-xl bg-muted/60 p-4 text-[0.9375rem] font-semibold text-heading">{t(checks)}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Why() {
  const t = useT();
  const items: { icon: ElementType; title: MessageKey; body: MessageKey }[] = [
    { icon: IconCurrencyRupee, title: "site.why.price.title", body: "site.why.price.body" },
    { icon: IconShieldCheck, title: "site.why.quality.title", body: "site.why.quality.body" },
    { icon: IconTruckDelivery, title: "site.why.buyers.title", body: "site.why.buyers.body" },
    { icon: IconHeadset, title: "site.why.help.title", body: "site.why.help.body" },
  ];
  return (
    <Section>
      <SectionHeading eyebrow={t("site.why.eyebrow")} title={t("site.why.title")} />
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="panel flex h-full gap-4 p-6">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary-muted text-brand-primary">
              <Icon size={24} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-heading">{t(title)}</h3>
              <p className="mt-1.5 text-base text-body">{t(body)}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ForBuyers() {
  const t = useT();
  return (
    <Section className="bg-card">
      <div className="panel flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{t("site.buyers.title")}</h2>
          <p className="mt-3 text-lg text-body">{t("site.buyers.body")}</p>
        </div>
        <Button asChild size="lg" variant="outline" className="shrink-0">
          <Link href="/register?role=buyer">{t("site.buyers.cta")}</Link>
        </Button>
      </div>
    </Section>
  );
}

function Faq() {
  const t = useT();
  const items = [1, 2, 3, 4, 5] as const;
  return (
    <Section>
      <SectionHeading title={t("site.faq.title")} />
      <Accordion type="single" collapsible className="panel-flush mx-auto mt-10 max-w-3xl">
        {items.map((n) => (
          <AccordionItem key={n} value={`q${n}`} className="border-border px-6">
            <AccordionTrigger className="py-5 text-left text-lg font-bold text-heading hover:no-underline">
              {t(`site.faq.q${n}`)}
            </AccordionTrigger>
            <AccordionContent className="pb-5 text-base text-body">{t(`site.faq.a${n}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
