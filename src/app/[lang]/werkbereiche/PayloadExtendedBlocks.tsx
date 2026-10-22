import { Suspense } from "react";

import Button from "@/components/knglmrt/Button";
import NewsSection from "@/app/NewsSection";
import ResourceOfTheMonthSection from "@/app/ResourceOfTheMonthSection";
import ShowcaseOfTheMonthSection from "@/app/ShowcaseOfTheMonthSection";
import {
  resolvePayloadLinkHref,
  resolvePayloadMediaUrl,
  type PayloadBlock,
  type PayloadLink,
  type PayloadMedia,
  type PayloadRecord,
  type PayloadRichText as PayloadRichTextData,
} from "@/lib/payload-cms";

import VereinCalendar, {
  VereinCalendarSkeleton,
} from "../verein/VereinCalendar";
import PayloadRichText from "./PayloadRichText";

type ExtendedItem = PayloadRecord & {
  caption?: string | null;
  content?: PayloadRichTextData | null;
  description?: PayloadRichTextData | string | null;
  enableLink?: boolean | null;
  eyebrow?: string | null;
  file?: PayloadMedia | string | number | null;
  hint?: string | null;
  label?: string | null;
  link?: PayloadLink | null;
  logo?: PayloadMedia | string | number | null;
  media?: PayloadMedia | string | number | null;
  name?: string | null;
  newTab?: boolean | null;
  title?: string | null;
  tone?: "grau" | "rosa" | "gelb" | "gruen" | null;
  url?: string | null;
  value?: string | null;
};

const getMedia = (value: unknown): PayloadMedia | null =>
  value && typeof value === "object" ? (value as PayloadMedia) : null;

const safeHref = (value: string | null | undefined) => {
  const href = value?.trim();
  if (!href) return null;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  try {
    const parsed = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

function Intro({ block }: { block: PayloadBlock }) {
  return (
    <PayloadRichText
      data={block.introContent}
      className="mb-5 max-w-[680px] leading-[var(--ui-line-body)]"
    />
  );
}

function DownloadsBlock({ block }: { block: PayloadBlock }) {
  const items = (block.items ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      <Intro block={block} />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, index) => {
          const file = getMedia(item.file);
          const href = resolvePayloadMediaUrl(file?.url) ?? safeHref(item.url);
          if (!href || !item.label) return null;
          return (
            <a
              key={`${item.label}-${index}`}
              href={href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noreferrer" : undefined}
              download={file?.filename ?? undefined}
              className="knglmrt-border bg-card px-4 py-3 transition hover:bg-primary-soft"
            >
              <span className="block font-bold text-primary">{item.label}</span>
              {typeof item.description === "string" && item.description ? (
                <span className="mt-1 block text-sm text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
    </section>
  );
}

const GRID_COLUMNS = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
} as const;

function GalleryBlock({ block }: { block: PayloadBlock }) {
  const items = (block.items ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      <Intro block={block} />
      <div className={`grid gap-4 ${GRID_COLUMNS[block.columnCount ?? "3"]}`}>
        {items.map((item, index) => {
          const media = getMedia(item.media);
          const src = resolvePayloadMediaUrl(media?.url);
          if (!src) return null;
          return (
            <figure key={media?.id ?? index} className="min-w-0">
              {media?.mimeType?.startsWith("video/") ? (
                <video controls className="aspect-[4/3] w-full knglmrt-border object-cover" src={src}>
                  <track kind="captions" />
                </video>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={media?.alt ?? item.caption ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full knglmrt-border object-cover"
                />
              )}
              {item.caption ? (
                <figcaption className="mt-2 text-sm text-muted-foreground">
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function LogoGridBlock({ block }: { block: PayloadBlock }) {
  const items = (block.items ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      <Intro block={block} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, index) => {
          const media = getMedia(item.logo);
          const src = resolvePayloadMediaUrl(media?.url);
          const href = safeHref(item.url);
          if (!src || !item.name) return null;
          const logo = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={media?.alt || item.name}
              loading="lazy"
              className="max-h-20 w-full object-contain"
            />
          );
          return href ? (
            <a
              key={`${item.name}-${index}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              title={item.name}
              className="flex min-h-28 items-center justify-center knglmrt-border bg-card p-4 transition hover:bg-primary-soft"
            >
              {logo}
            </a>
          ) : (
            <div
              key={`${item.name}-${index}`}
              title={item.name}
              className="flex min-h-28 items-center justify-center knglmrt-border bg-card p-4"
            >
              {logo}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const ASPECT_RATIO = {
  "16/9": "aspect-video",
  "4/3": "aspect-[4/3]",
  "1/1": "aspect-square",
} as const;

function EmbedBlock({ block }: { block: PayloadBlock }) {
  const src = safeHref(block.url);
  if (!src || !src.startsWith("https://")) return null;
  return (
    <section className="knglmrt-border-t py-6">
      {block.title ? <h2 className="mb-4">{block.title}</h2> : null}
      {block.kind === "audio" ? (
        <audio controls className="w-full" src={src} />
      ) : block.kind === "video" ? (
        <video controls className="w-full knglmrt-border" src={src}>
          <track kind="captions" />
        </video>
      ) : (
        <iframe
          src={src}
          title={block.title || "Eingebetteter Inhalt"}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          className={`w-full knglmrt-border ${ASPECT_RATIO[block.aspectRatio ?? "16/9"]}`}
        />
      )}
      {typeof block.caption === "string" && block.caption ? (
        <p className="mt-2 text-sm text-muted-foreground">{block.caption}</p>
      ) : null}
    </section>
  );
}

function ContactBlock({ block }: { block: PayloadBlock }) {
  const mapHref = safeHref(block.mapUrl);
  return (
    <section className="knglmrt-border-t py-6">
      {block.heading ? <h2 className="mb-4">{block.heading}</h2> : null}
      <Intro block={block} />
      <div className="grid gap-5 md:grid-cols-2">
        <address className="not-italic knglmrt-border bg-card p-5">
          {block.address ? (
            <p className="mb-3 whitespace-pre-line">{block.address}</p>
          ) : null}
          {block.email ? (
            <a className="block font-bold text-primary" href={`mailto:${block.email}`}>
              {block.email}
            </a>
          ) : null}
          {block.phone ? (
            <a
              className="mt-1 block font-bold text-primary"
              href={`tel:${block.phone.replace(/[^+\d]/g, "")}`}
            >
              {block.phone}
            </a>
          ) : null}
        </address>
        <div className="flex flex-col justify-center gap-3 bg-primary-soft p-5">
          {mapHref ? (
            <Button href={mapHref} kind="primary" target="_blank" rel="noreferrer">
              Karte öffnen
            </Button>
          ) : null}
          {(block.links ?? []).map((entry, index) => {
            const href = resolvePayloadLinkHref(entry.link);
            if (!href || !entry.link?.label) return null;
            return (
              <Button
                key={`${entry.link.label}-${index}`}
                href={href}
                kind="secondary"
                target={entry.link.newTab ? "_blank" : undefined}
                rel={entry.link.newTab ? "noreferrer" : undefined}
              >
                {entry.link.label}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AccordionBlock({ block }: { block: PayloadBlock }) {
  const items = (block.items ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      {block.heading ? <h2 className="mb-3">{block.heading}</h2> : null}
      <Intro block={block} />
      <div className="knglmrt-border bg-card">
        {items.map((item, index) => (
          <details
            key={`${item.title ?? "Eintrag"}-${index}`}
            className="group border-b border-border last:border-b-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-bold marker:hidden">
              {item.title}
              <span aria-hidden="true" className="text-xl text-primary transition group-open:rotate-45">
                +
              </span>
            </summary>
            <PayloadRichText data={item.content} className="px-4 pb-4" />
          </details>
        ))}
      </div>
    </section>
  );
}

const STAT_TONE = {
  grau: "bg-muted",
  rosa: "bg-primary-soft",
  gelb: "bg-ui-remember",
  gruen: "bg-[#d7edd0]",
} as const;

function StatsBlock({ block }: { block: PayloadBlock }) {
  const items = (block.items ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      <Intro block={block} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={`${item.label ?? "Kennzahl"}-${index}`}
            className={`flex min-h-28 flex-col justify-center px-5 py-4 ${STAT_TONE[item.tone ?? "grau"]}`}
          >
            <span className="knglmrt-caption text-muted-foreground">{item.label}</span>
            <strong className="knglmrt-value mt-1 text-primary">{item.value}</strong>
            {item.hint ? (
              <span className="mt-1 text-sm text-muted-foreground">{item.hint}</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CardGridBlock({ block }: { block: PayloadBlock }) {
  const cards = (block.cards ?? []) as ExtendedItem[];
  return (
    <section className="knglmrt-border-t py-6">
      <Intro block={block} />
      <div className={`grid gap-4 ${GRID_COLUMNS[block.columnCount ?? "3"]}`}>
        {cards.map((card, index) => {
          const media = getMedia(card.media);
          const src = resolvePayloadMediaUrl(media?.url);
          const href = card.enableLink ? resolvePayloadLinkHref(card.link) : null;
          const body = (
            <>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={media?.alt ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full border-b border-border object-cover"
                />
              ) : null}
              <div className="p-4">
                {card.eyebrow ? (
                  <span className="knglmrt-tag text-primary">{card.eyebrow}</span>
                ) : null}
                <h3 className="mt-1 text-xl">{card.title}</h3>
                {typeof card.description === "object" ? (
                  <PayloadRichText
                    data={card.description}
                    className="mt-2 text-sm text-muted-foreground"
                  />
                ) : null}
              </div>
            </>
          );
          return href ? (
            <a
              key={`${card.title ?? "Karte"}-${index}`}
              href={href}
              target={card.link?.newTab ? "_blank" : undefined}
              rel={card.link?.newTab ? "noreferrer" : undefined}
              className="knglmrt-terrazzo-hover knglmrt-border bg-card transition hover:bg-primary-soft"
            >
              {body}
            </a>
          ) : (
            <article key={`${card.title ?? "Karte"}-${index}`} className="knglmrt-border bg-card">
              {body}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AppSlotBlock({ block }: { block: PayloadBlock }) {
  switch (block.slot) {
    case "calendarUpcoming":
      return (
        <section className="knglmrt-border-t py-6">
          <Suspense fallback={<VereinCalendarSkeleton />}>
            <VereinCalendar />
          </Suspense>
        </section>
      );
    // Live-Bereiche streamen nach, statt die ganze CMS-Seite aufzuhalten.
    case "news":
      return (
        <Suspense fallback={null}>
          <NewsSection />
        </Suspense>
      );
    case "showcaseOfMonth":
      return (
        <Suspense fallback={null}>
          <ShowcaseOfTheMonthSection />
        </Suspense>
      );
    case "resourceOfMonth":
      return (
        <Suspense fallback={null}>
          <ResourceOfTheMonthSection />
        </Suspense>
      );
    default:
      return null;
  }
}

export default function PayloadExtendedBlock({ block }: { block: PayloadBlock }) {
  switch (block.blockType) {
    case "downloads":
      return <DownloadsBlock block={block} />;
    case "gallery":
      return <GalleryBlock block={block} />;
    case "logoGrid":
      return <LogoGridBlock block={block} />;
    case "embed":
      return <EmbedBlock block={block} />;
    case "contact":
      return <ContactBlock block={block} />;
    case "accordion":
      return <AccordionBlock block={block} />;
    case "stats":
      return <StatsBlock block={block} />;
    case "cardGrid":
      return <CardGridBlock block={block} />;
    case "appSlot":
      return <AppSlotBlock block={block} />;
    default:
      return null;
  }
}
