"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

import Button from "@/components/knglmrt/Button";
import { isVideoUrl } from "@/lib/resource-media";

type ShowcaseSlide = {
  id: string;
  prettyTitle?: string | null;
  name: string;
  description?: string;
  mediaUrl?: string | null;
  previewMediaUrl?: string | null;
  posterUrl?: string | null;
  workshopName?: string | null;
  tags?: string[];
  ctaLabel: string;
  href: string;
};

type ShowcaseOfTheMonthCarouselProps = {
  showcases: ShowcaseSlide[];
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

export default function ShowcaseOfTheMonthCarousel({
  showcases,
}: ShowcaseOfTheMonthCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeShowcase = showcases[activeIndex] ?? null;
  const dots = useMemo(
    () => showcases.map((showcase) => ({ id: showcase.id })),
    [showcases],
  );

  if (!activeShowcase) {
    return null;
  }

  return (
    <section className="overflow-hidden knglmrt-border bg-card">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,520px)]">
        <div className="flex flex-col justify-center px-6 py-6 md:px-8 md:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Beitrag des Monats
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {activeShowcase.name}
          </h2>
          {activeShowcase.workshopName ? (
            <p className="mt-3 text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {activeShowcase.workshopName}
            </p>
          ) : null}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {truncate(
              activeShowcase.description?.trim() ||
                "Ein ausgewählter Beitrag aus den Werkstätten des Konglomerat e.V.",
              220,
            )}
          </p>

          {activeShowcase.tags && activeShowcase.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {activeShowcase.tags.slice(0, 4).map((tag) => (
                <span
                  key={`${activeShowcase.id}-${tag}`}
                  className="knglmrt-tag bg-muted px-[7px] py-[3px] text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button href={activeShowcase.href} kind="primary" size="medium">
              {activeShowcase.ctaLabel}
            </Button>
            {showcases.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  kind="secondary"
                  size="small"
                  onClick={() =>
                    setActiveIndex((previous) =>
                      previous === 0 ? showcases.length - 1 : previous - 1,
                    )
                  }
                >
                  Zurück
                </Button>
                <Button
                  type="button"
                  kind="secondary"
                  size="small"
                  onClick={() =>
                    setActiveIndex(
                      (previous) => (previous + 1) % showcases.length,
                    )
                  }
                >
                  Weiter
                </Button>
              </div>
            ) : null}
          </div>

          {showcases.length > 1 ? (
            <div className="mt-5 flex items-center gap-2">
              {dots.map((dot, index) => (
                <button
                  key={dot.id}
                  type="button"
                  aria-label={`Gehe zu Slide ${index + 1}`}
                  className={`h-2.5 transition ${
                    index === activeIndex ? "w-8 bg-primary" : "w-2.5 bg-border"
                  }`}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative min-h-[360px] bg-[linear-gradient(135deg,#dbeafe_0%,#fef3c7_100%)]">
          {activeShowcase.mediaUrl ? (
            isVideoUrl(activeShowcase.mediaUrl) ? (
              <video
                src={activeShowcase.previewMediaUrl ?? activeShowcase.mediaUrl}
                poster={activeShowcase.posterUrl ?? undefined}
                controls
                autoPlay
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-foreground object-cover"
              />
            ) : (
              <img
                src={activeShowcase.previewMediaUrl ?? activeShowcase.mediaUrl}
                alt={activeShowcase.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#ffffff_0%,transparent_40%),linear-gradient(135deg,#dbeafe_0%,#fef3c7_100%)]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.48)_100%)] lg:bg-[linear-gradient(90deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.02)_42%)]" />
        </div>
      </div>
    </section>
  );
}
