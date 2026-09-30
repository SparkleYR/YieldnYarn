import type { Metadata } from "next";

import { GuidesPage } from "@/components/marketing/info-pages";

export const metadata: Metadata = {
  title: "Guides — YieldnYarn",
  description: "How to take good photos, what grades mean, how the price is worked out, and what to do if something goes wrong.",
};

export default function Page() {
  return <GuidesPage />;
}
