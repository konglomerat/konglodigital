// „Andere Workshops für Gruppen“: kleine verlinkte Kacheln am Ende der Seite.
import Link from "next/link";

import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { groupWorkshopHref, type GroupWorkshop } from "@/lib/group-workshops";
import WorkshopAreaMark from "../WorkshopAreaMark";

export default async function OtherGroupWorkshops({
  workshops,
  className,
  innerClassName,
}: {
  workshops: GroupWorkshop[];
  className?: string;
  innerClassName?: string;
}) {
  const { tx, locale } = await getServerI18n();
  if (!workshops.length) return null;

  return (
    <section aria-labelledby="andere-titel" className={`${className ?? ""} bg-muted`}>
      <div className={`${innerClassName ?? ""} py-12`}>
        <h2 id="andere-titel" className="knglmrt-card-title m-0 font-[family-name:var(--font-core)]">
          {tx("Andere Workshops für Gruppen", "de")}
        </h2>
        <ul className="m-0 mt-4 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4 p-0">
          {workshops.map((workshop) => (
            <li key={workshop.slug}>
              <Link
                href={localizePathname(groupWorkshopHref(workshop.slug), locale)}
                className="flex h-full items-center gap-3.5 bg-card px-4 py-3.5 text-foreground no-underline hover:bg-[var(--knglmrt-paper-pink)] dark:hover:bg-primary-soft"
              >
                <WorkshopAreaMark area={workshop.area} height={40} />
                <span className="min-w-0">
                  <span className="block font-bold">{workshop.title}</span>
                  <span className="block text-muted-foreground">{workshop.audience}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
