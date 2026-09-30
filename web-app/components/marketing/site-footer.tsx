"use client";

import Link from "next/link";
import { IconLeaf } from "@tabler/icons-react";

import { NAV_LINKS, SITE_NAME } from "@/lib/constants";
import { useT } from "@/lib/i18n";

export function SiteFooter() {
  const t = useT();
  const linkClass = "text-[0.9375rem] font-medium text-body transition-colors hover:text-heading";

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-primary text-white">
              <IconLeaf size={20} stroke={2.2} />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-heading">{SITE_NAME}</span>
          </Link>
          <p className="mt-4 max-w-xs text-[0.9375rem] text-body">{t("site.footer.tagline")}</p>
        </div>
        <div>
          <p className="text-sm font-bold text-heading">{t("site.footer.explore")}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-heading">{t("site.footer.account")}</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <Link href="/login" className={linkClass}>
                {t("site.nav.login")}
              </Link>
            </li>
            <li>
              <Link href="/register" className={linkClass}>
                {t("site.nav.start")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-2 sm:px-6">
          {t("site.footer.rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
