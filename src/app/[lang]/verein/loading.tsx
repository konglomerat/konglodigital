// Skelett der Vereinsseite: Textspalte links, Kalender rechts — wie die
// fertige Seite, damit beim Nachladen nichts springt.
import {
  PageSkeleton,
  SkeletonParagraph,
  SkeletonTitle,
} from "../components/PageSkeleton";
import { VereinCalendarSkeleton } from "./VereinCalendar";

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonTitle />
      <div className="grid items-start gap-9 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-6">
          <SkeletonParagraph lines={4} />
          <SkeletonParagraph lines={4} />
          <SkeletonParagraph lines={3} />
        </div>
        <VereinCalendarSkeleton />
      </div>
    </PageSkeleton>
  );
}
