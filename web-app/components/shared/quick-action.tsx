import Link from "next/link";
import type { ElementType } from "react";
import { IconArrowRight } from "@tabler/icons-react";

/** A big, equal-height shortcut card: icon, title, one line of help. */
export function QuickAction({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ElementType;
}) {
  return (
    <Link
      href={href}
      className="panel group flex h-full items-start gap-4 transition-colors hover:border-brand-primary/60 hover:bg-brand-primary-muted/40"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary-muted text-brand-primary">
        <Icon size={22} stroke={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-base font-bold text-heading">
          {title}
          <IconArrowRight size={16} className="text-brand-primary transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="text-sm text-body">{description}</span>
      </span>
    </Link>
  );
}
