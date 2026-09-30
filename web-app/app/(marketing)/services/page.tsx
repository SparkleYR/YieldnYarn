import type { Metadata } from "next";

import { HowPage } from "@/components/marketing/info-pages";

export const metadata: Metadata = {
  title: "How it works — YieldnYarn",
  description: "How selling and buying work on YieldnYarn, and what the quality grades mean.",
};

export default function Page() {
  return <HowPage />;
}
