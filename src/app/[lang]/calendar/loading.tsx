// Skelett des Kalenders: Kopf und die ersten Tage.
import { PageSkeleton, SkeletonTitle } from "../components/PageSkeleton";
import CalendarDaysSkeleton from "./CalendarDaysSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Kalender wird geladen.">
      <SkeletonTitle />
      <CalendarDaysSkeleton />
    </PageSkeleton>
  );
}
