// Skelett der Beitragsübersicht: Titel und Kartenraster.
import {
  PageSkeleton,
  SkeletonCards,
  SkeletonTitle,
} from "../components/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Beiträge werden geladen.">
      <SkeletonTitle />
      <SkeletonCards count={6} />
    </PageSkeleton>
  );
}
