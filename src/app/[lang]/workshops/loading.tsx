// Skelett der Workshop-Seite: gleiche Spalte wie die Terminliste.
import {
  PageSkeleton,
  SkeletonCards,
  SkeletonTitle,
} from "../components/PageSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pt-6 md:pt-2">
      <PageSkeleton label="Workshops werden geladen.">
        <SkeletonTitle />
        <SkeletonCards count={4} className="sm:grid-cols-2" />
      </PageSkeleton>
    </div>
  );
}
