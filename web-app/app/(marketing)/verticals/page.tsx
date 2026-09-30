import type { Metadata } from "next";

import { SellPage } from "@/components/marketing/info-pages";

export const metadata: Metadata = {
  title: "What you can sell — YieldnYarn",
  description: "Grains, pulses and fabric: what you can sell on YieldnYarn and what we check for each.",
};

export default function Page() {
  return <SellPage />;
}
