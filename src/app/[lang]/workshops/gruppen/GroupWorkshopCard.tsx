"use client";

// Karte eines Gruppen-Workshops in der Übersicht. Titel und Taste führen auf
// die Detailseite, auf der auch angefragt wird.
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { Fragment, useState } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import { localizePathname } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import {
  formatGroupSize,
  groupWorkshopHref,
  type GroupWorkshop,
} from "@/lib/group-workshops";
import { areaLabel } from "@/lib/workshops";

// Blätterpfeile wie in der Ressourcen-Übersicht: erst beim Hover, klein,
// halbtransparent.
const slideButtonClassName =
  "pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center bg-card/80 text-foreground opacity-0 transition-opacity duration-200 hover:bg-card focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] group-hover:opacity-100";

export default function GroupWorkshopCard({ workshop }: { workshop: GroupWorkshop }) {
  const { tx, locale } = useI18n();
  const href = localizePathname(groupWorkshopHref(workshop.slug), locale);
  const slides = workshop.images.filter((image) => Boolean(image.src));
  const hasImage = slides.length > 0;
  const canBrowse = slides.length > 1;
  const [activeIndex, setActiveIndex] = useState(0);

  const step = (direction: 1 | -1) => {
    setActiveIndex((previous) => (previous + direction + slides.length) % slides.length);
  };

  // Eckdaten; die Bezeichnungen im Label-Stil wie auf der Detailseite, damit
  // sie sich vom Kurztext darüber abheben.
  const facts = [
    { label: tx("Für", "de"), value: workshop.audience },
    { label: tx("Dauer", "de"), value: workshop.duration },
    {
      label: tx("Gruppe", "de"),
      value: formatGroupSize(workshop.groupSize).replace("Pers.", tx("Pers.", "de")),
    },
    { label: tx("Kosten", "de"), value: workshop.price },
  ];

  return (
    <article className="group flex flex-col bg-card">
      <div
        className={`relative aspect-[3/2] overflow-hidden ${
          hasImage ? "bg-muted" : workshop.terrazzo
        }`}
      >
        {hasImage ? (
          <div
            className="absolute inset-0 flex transition-transform duration-200 ease-[cubic-bezier(.2,0,0,1)]"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {slides.map((slide, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={slide.src}
                src={slide.src ?? ""}
                alt={index === activeIndex ? slide.alt : ""}
                aria-hidden={index === activeIndex ? undefined : true}
                loading="lazy"
                className="block h-full w-full shrink-0 object-cover"
              />
            ))}
          </div>
        ) : null}
        <Badge tone="kontur" className="absolute right-3 top-3 z-10 bg-card">
          {areaLabel(workshop.area)}
        </Badge>
        {canBrowse ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-1.5">
              <button
                type="button"
                aria-label={tx("Previous image")}
                onClick={() => step(-1)}
                className={slideButtonClassName}
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={tx("Next image")}
                onClick={() => step(1)}
                className={slideButtonClassName}
              >
                <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
              </button>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-1.5 left-0 right-0 z-10 flex justify-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              {slides.map((slide, index) => (
                <span
                  key={slide.src}
                  className={`h-1.5 w-1.5 ${
                    index === activeIndex ? "bg-foreground" : "bg-foreground/25"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-[22px] pb-6 pt-[22px]">
        <h3 className="knglmrt-card-title m-0">
          <Link href={href} className="text-foreground no-underline hover:text-primary">
            {workshop.title}
          </Link>
        </h3>
        <p className="m-0 text-pretty text-muted-foreground">{workshop.summary}</p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          {facts.map((fact) => (
            <Fragment key={fact.label}>
              <dt className="knglmrt-label text-muted-foreground">{fact.label}</dt>
              <dd className="knglmrt-num m-0">{fact.value}</dd>
            </Fragment>
          ))}
        </dl>
        <div className="mt-auto flex justify-end pt-2.5">
          <Button
            href={href}
            kind="tertiary"
            aria-label={`${workshop.title}: ${tx("Details & Anfrage", "de")}`}
          >
            {tx("Details & Anfrage", "de")}
          </Button>
        </div>
      </div>
    </article>
  );
}
