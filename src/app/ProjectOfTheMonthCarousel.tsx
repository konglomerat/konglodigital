"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

import Button from "./[lang]/components/Button";
import { isVideoUrl } from "@/lib/resource-media";

type ProjectSlide = {
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

type ProjectOfTheMonthCarouselProps = {
  projects: ProjectSlide[];
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

export default function ProjectOfTheMonthCarousel({
  projects,
}: ProjectOfTheMonthCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeProject = projects[activeIndex] ?? null;
  const dots = useMemo(
    () => projects.map((project) => ({ id: project.id })),
    [projects],
  );

  if (!activeProject) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,520px)]">
        <div className="flex flex-col justify-center px-6 py-6 md:px-8 md:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Projekt des Monats
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {activeProject.name}
          </h2>
          {activeProject.workshopName ? (
            <p className="mt-3 text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {activeProject.workshopName}
            </p>
          ) : null}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {truncate(
              activeProject.description?.trim() ||
                "Ein ausgewähltes Projekt aus den Werkstätten des Konglomerat e.V.",
              220,
            )}
          </p>

          {activeProject.tags && activeProject.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {activeProject.tags.slice(0, 4).map((tag) => (
                <span
                  key={`${activeProject.id}-${tag}`}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground/85"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button href={activeProject.href} kind="primary" size="medium">
              {activeProject.ctaLabel}
            </Button>
            {projects.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  kind="secondary"
                  size="small"
                  onClick={() =>
                    setActiveIndex((previous) =>
                      previous === 0 ? projects.length - 1 : previous - 1,
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
                      (previous) => (previous + 1) % projects.length,
                    )
                  }
                >
                  Weiter
                </Button>
              </div>
            ) : null}
          </div>

          {projects.length > 1 ? (
            <div className="mt-5 flex items-center gap-2">
              {dots.map((dot, index) => (
                <button
                  key={dot.id}
                  type="button"
                  aria-label={`Gehe zu Slide ${index + 1}`}
                  className={`h-2.5 rounded-full transition ${
                    index === activeIndex ? "w-8 bg-primary" : "w-2.5 bg-border"
                  }`}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative min-h-[360px] bg-[linear-gradient(135deg,#dbeafe_0%,#fef3c7_100%)]">
          {activeProject.mediaUrl ? (
            isVideoUrl(activeProject.mediaUrl) ? (
              <video
                src={activeProject.previewMediaUrl ?? activeProject.mediaUrl}
                poster={activeProject.posterUrl ?? undefined}
                controls
                autoPlay
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-foreground object-cover"
              />
            ) : (
              <img
                src={activeProject.previewMediaUrl ?? activeProject.mediaUrl}
                alt={activeProject.name}
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
