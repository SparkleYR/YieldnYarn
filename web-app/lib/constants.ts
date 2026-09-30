import type { MessageKey } from "@/lib/i18n/messages";

export const SITE_NAME = "YieldnYarn";

export const NAV_LINKS: { labelKey: MessageKey; href: string }[] = [
  { labelKey: "site.nav.how", href: "/services" },
  { labelKey: "site.nav.sell", href: "/verticals" },
  { labelKey: "site.nav.guides", href: "/blog" },
  { labelKey: "site.nav.pricing", href: "/pricing" },
];
