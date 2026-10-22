"use client";

// Karte eines Gruppen-Workshops in der Übersicht. Titel und Taste führen auf
// die Detailseite, auf der auch angefragt wird.
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import { localizePathname } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import {
  formatGroupSize,
  groupWorkshopHref,
  type GroupWorkshop,
} from "@/lib/group-workshops";
import WorkshopAreaMark from "../WorkshopAreaMark";

export default function GroupWorkshopCard({ workshop }: { workshop: GroupWorkshop }) {
  const { tx, locale } = useI18n();
  const href = localizePathname(groupWorkshopHref(workshop.slug), locale);
  const image = workshop.images[0];
  const hasImage = Boolean(image?.src);

  return (
    <article className="flex flex-col bg-card">
      <div
        className={`relative flex aspect-[3/2] items-center justify-center ${workshop.terrazzo}`}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src ?? ""}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <span className={`flex bg-card p-1.5 ${hasImage ? "absolute right-3 top-3" : ""}`}>
          <WorkshopAreaMark area={workshop.area} height={hasImage ? 40 : 56} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-[22px] pb-6 pt-[22px]">
        <h3 className="knglmrt-card-title m-0">
          <Link href={href} className="text-foreground no-underline hover:text-primary">
            {workshop.title}
          </Link>
        </h3>
        <p className="m-0 text-pretty text-muted-foreground">{workshop.summary}</p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1">
          <dt className="text-muted-foreground">{tx("Für", "de")}</dt>
          <dd className="m-0">{workshop.audience}</dd>
          <dt className="text-muted-foreground">{tx("Dauer", "de")}</dt>
          <dd className="knglmrt-num m-0 self-center">{workshop.duration}</dd>
          <dt className="text-muted-foreground">{tx("Gruppe", "de")}</dt>
          <dd className="knglmrt-num m-0 self-center">
            {formatGroupSize(workshop.groupSize).replace("Pers.", tx("Pers.", "de"))}
          </dd>
        </dl>
        <div className="mt-auto pt-2.5">
          <Button
            href={href}
            kind="tertiary"
            aria-label={`${workshop.title}: ${tx("Details & anfragen", "de")}`}
          >
            {tx("Details & anfragen", "de")}
          </Button>
        </div>
      </div>
    </article>
  );
}
