"use client";

import Link from "next/link";
import { IconCamera, IconCurrencyRupee, IconLeaf, IconUsers } from "@tabler/icons-react";

import { SITE_NAME } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const points = [
    { icon: IconCamera, text: t("auth.side.photos") },
    { icon: IconCurrencyRupee, text: t("auth.side.price") },
    { icon: IconUsers, text: t("auth.side.buyers") },
  ];

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-primary p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-brand-primary">
            <IconLeaf size={22} stroke={2.2} />
          </span>
          <span className="text-xl font-extrabold tracking-tight">{SITE_NAME}</span>
        </Link>
        <div>
          <h2 className="max-w-md text-4xl leading-tight font-extrabold text-white">{t("auth.side.title")}</h2>
          <ul className="mt-8 flex flex-col gap-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-lg font-semibold text-white/95">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon size={22} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-medium text-white/80">{t("auth.side.footer")}</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-primary text-white">
            <IconLeaf size={22} stroke={2.2} />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-heading">{SITE_NAME}</span>
        </Link>
        <div className="w-full max-w-md">{children}</div>
        <LanguageSwitcher className="mt-6" />
      </main>
    </div>
  );
}
