import {
  IconLayoutDashboard,
  IconShoppingBag,
  IconClipboardList,
  IconPackage,
  IconCalculator,
  IconBell,
  IconAdjustmentsHorizontal,
  IconShieldCheck,
  IconGavel,
  IconUsers,
  IconCurrencyRupee,
  IconClipboardCheck,
  IconArrowsExchange,
} from "@tabler/icons-react";

import type { MessageKey } from "@/lib/i18n/messages";

export interface DashboardNavItem {
  label: string;
  /** Translated label for the buyer portal; staff consoles stay English. */
  labelKey?: MessageKey;
  href: string;
  icon: typeof IconLayoutDashboard;
}

export const BUYER_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Dashboard", labelKey: "nav.dashboard", href: "/buyer/dashboard", icon: IconLayoutDashboard },
  { label: "Catalog", labelKey: "nav.catalog", href: "/buyer/catalog", icon: IconShoppingBag },
  { label: "Requirements", labelKey: "nav.requirements", href: "/buyer/requirements", icon: IconClipboardList },
  { label: "My Offers", labelKey: "nav.offers", href: "/buyer/offers", icon: IconArrowsExchange },
  { label: "Orders", labelKey: "nav.orders", href: "/buyer/orders", icon: IconPackage },
  { label: "Cost Estimator", labelKey: "nav.estimate", href: "/buyer/estimate", icon: IconCalculator },
  { label: "Notifications", labelKey: "nav.notifications", href: "/buyer/notifications", icon: IconBell },
];

export const ADMIN_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: IconLayoutDashboard },
  { label: "Verticals", href: "/admin/verticals", icon: IconAdjustmentsHorizontal },
  { label: "Verification", href: "/admin/verification", icon: IconShieldCheck },
  { label: "Disputes", href: "/admin/disputes", icon: IconGavel },
  { label: "Users", href: "/admin/users", icon: IconUsers },
  { label: "Pricing", href: "/admin/pricing", icon: IconCurrencyRupee },
];

export const VERIFIER_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Dashboard", href: "/verifier/dashboard", icon: IconLayoutDashboard },
  { label: "Verification Queue", href: "/verifier/queue", icon: IconClipboardCheck },
];
