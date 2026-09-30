"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { dashboardPathForRole } from "@/lib/auth";
import { VERIFIER_NAV_ITEMS } from "@/components/shared/dashboard-nav-items";
import { DashboardLayout } from "@/components/shared/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";

// Admins can open the checking pages too (e.g. to correct a grade from the
// admin quality-check list).
const CAN_CHECK = new Set(["VERIFIER", "ADMIN"]);

export default function VerifierLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    } else if (user && !CAN_CHECK.has(user.role)) {
      router.replace(dashboardPathForRole(user.role));
    }
  }, [user, router]);

  if (!user || !CAN_CHECK.has(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <DashboardLayout user={user} navItems={VERIFIER_NAV_ITEMS}>
      {children}
    </DashboardLayout>
  );
}
