import type { Metadata } from "next";

import { PricingPage } from "@/components/marketing/info-pages";

export const metadata: Metadata = {
  title: "Pricing — YieldnYarn",
  description: "YieldnYarn is free to use today.",
};

export default function Page() {
  return <PricingPage />;
}
