// Ladeskelett für die Verwaltung: dieselbe dunkle Leiste wie VerwaltungShell
// (unter lg als Zeile oben), daneben das übliche Seitenskelett. So springt
// beim Laden nichts, wenn der Rahmen samt Leiste noch nicht da ist.
import { PageSkeleton, SkeletonBar } from "./PageSkeleton";

const NAV_WIDTHS = ["w-24", "w-20", "w-28", "w-16", "w-24", "w-20"];

export function VerwaltungSkeleton() {
  return (
    <div className="flex flex-col md:h-full md:min-h-0 md:overflow-hidden lg:flex-row">
      <div className="flex shrink-0 items-center gap-3 bg-[var(--knglmrt-dark-100)] px-4 py-3 text-white lg:hidden">
        <span className="font-bold text-[length:var(--ui-size-nav)] leading-[18px]">
          Verwaltung
        </span>
      </div>
      <aside
        aria-hidden="true"
        className="hidden w-[220px] shrink-0 bg-[var(--knglmrt-dark-100)] lg:flex lg:h-full lg:flex-col"
      >
        <div className="px-5 pb-4 pt-5 font-[family-name:var(--font-display)] text-[20px] leading-tight text-white">
          Verwaltung
        </div>
        <div className="flex animate-pulse flex-col gap-[22px] px-5 py-2.5">
          {NAV_WIDTHS.map((width, index) => (
            <SkeletonBar key={index} className={`h-[14px] ${width} bg-white/15`} />
          ))}
        </div>
      </aside>
      <div className="min-w-0 px-4 py-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-7 md:py-10">
        <PageSkeleton />
      </div>
    </div>
  );
}

/** Pfade, die im Verwaltungsrahmen stehen (siehe die Layouts mit VerwaltungShell). */
export const VERWALTUNG_ROUTES = ["/admin", "/receipts", "/kofi", "/split-invoice"];
