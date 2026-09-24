// Platzhalter für die Ehrenamtsbonus-Unterseite. Gleiche Regel wie beim
// Konto-Skelett: nur Flächen, keine erfundenen Inhalte.
import { SkeletonBlock } from "../AccountSkeleton";

export default function EhrenamtsbonusSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBlock className="h-9 w-28" />
      <div>
        <SkeletonBlock className="mb-2 h-7 w-64" />
        <SkeletonBlock className="h-4 w-[420px] max-w-full" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <SkeletonBlock key={index} className="h-24 w-full" />
        ))}
      </div>
      <SkeletonBlock className="h-96 w-full" />
      <span className="sr-only" role="status">
        Ehrenamtsbonus wird geladen …
      </span>
    </div>
  );
}
