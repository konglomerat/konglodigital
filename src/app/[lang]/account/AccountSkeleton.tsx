// Platzhalter für die Kontoseite. Wird als <Suspense>-Fallback der
// Server-Hülle und innerhalb des Clients gezeigt, solange /api/account/me
// noch unterwegs ist. Bewusst nur Flächen — keine erfundenen Inhalte.

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse bg-muted${className ? ` ${className}` : ""}`}
    />
  );
}

export function AccountHeaderSkeleton() {
  return (
    <header className="mb-[22px] flex flex-wrap items-center gap-4">
      <SkeletonBlock className="h-14 w-14 flex-none" />
      <div className="min-w-[240px] flex-1">
        <SkeletonBlock className="mb-2 h-6 w-52" />
        <SkeletonBlock className="h-4 w-72" />
      </div>
    </header>
  );
}

export default function AccountSkeleton() {
  return (
    <div>
      <AccountHeaderSkeleton />
      <div className="grid gap-3.5 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <SkeletonBlock key={index} className="h-24 w-full" />
        ))}
      </div>
      <span className="sr-only" role="status">
        Konto wird geladen …
      </span>
    </div>
  );
}
