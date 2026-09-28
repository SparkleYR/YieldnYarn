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

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: typeof IconLayoutDashboard;
}

export const BUYER_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Dashboard", href: "/buyer/dashboard", icon: IconLayoutDashboard },
  { label: "Catalog", href: "/buyer/catalog", icon: IconShoppingBag },
  { label: "Requirements", href: "/buyer/requirements", icon: IconClipboardList },
  { label: "My Offers", href: "/buyer/offers", icon: IconArrowsExchange },
  { label: "Orders", href: "/buyer/orders", icon: IconPackage },
  { label: "Cost Estimator", href: "/buyer/estimate", icon: IconCalculator },
  { label: "Notifications", href: "/buyer/notifications", icon: IconBell },
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
