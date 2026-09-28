import type { Metadata } from "next";
import { Inter, DM_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Hindi UI text: Inter has no Devanagari glyphs.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MSME Marketplace — Trade Commodities Smarter Across India",
  description:
    "AI-graded quality. Real-time market pricing. Multi-seller order fulfillment. Built for MSME producers and buyers across Agriculture and Textiles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmMono.variable} ${devanagari.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
