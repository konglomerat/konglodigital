import type { ReactNode } from "react";
import Link from "next/link";

type BookingPageHeaderProps = {
  title: string;
  description?: string;
  helperText?: string;
  icon?: ReactNode;
  iconClassName?: string;
};

export default function BookingPageHeader({
  title,
  description,
  helperText,
  icon: _icon,
  iconClassName: _iconClassName,
}: BookingPageHeaderProps) {
  return (
    <header className="space-y-3">
      <Link
        href="/meine-buchungen"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
      >
        <span aria-hidden="true">←</span>
        <span>Meine Buchungen</span>
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>

      {description ? (
        <p className="max-w-4xl text-sm leading-relaxed text-zinc-600">
          {description}
        </p>
      ) : null}

      {helperText ? <p className="text-xs text-zinc-500">{helperText}</p> : null}
    </header>
  );
}