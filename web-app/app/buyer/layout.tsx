"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { User } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { dashboardPathForRole } from "@/lib/auth";
import { BUYER_NAV_ITEMS } from "@/components/shared/dashboard-nav-items";
import { DashboardLayout } from "@/components/shared/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";

// Sellers share this same console shell — there's no separate seller web UI
// (that's the deferred Android app) — so this has to accept both roles.
// dashboardPathForRole() already routes SELLER here; a role check that only
// accepted BUYER would send a seller into a redirect-to-self loop (this
// layout redirecting to dashboardPathForRole("SELLER"), which is this exact
// route), leaving them stuck on the loading skeleton below forever.
const ALLOWED_ROLES: User["role"][] = ["BUYER", "SELLER"];

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    } else if (user && !ALLOWED_ROLES.includes(user.role)) {
      router.replace(dashboardPathForRole(user.role));
    }
  }, [user, router]);

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <DashboardLayout user={user} navItems={BUYER_NAV_ITEMS}>
      {children}
    </DashboardLayout>
  );
}
