import Link from "next/link";
import { IconLeaf } from "@tabler/icons-react";

import { SITE_NAME } from "@/lib/constants";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary-glow">
          <IconLeaf size={20} stroke={2} />
        </span>
        <span className="text-base font-semibold tracking-tight text-natural-white">
          {SITE_NAME}
        </span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <LanguageSwitcher className="mt-6" />
    </div>
  );
}
