import Button from "@/components/knglmrt/Button";
import {
  loadPayloadArchivePosts,
  resolvePayloadLinkHref,
  resolvePayloadMediaUrl,
  type PayloadBlock,
  type PayloadLink,
  type PayloadMedia,
  type PayloadPost,
} from "@/lib/payload-cms";

import PayloadFormBlock, { type CmsForm } from "./PayloadFormBlock";
import PayloadExtendedBlock from "./PayloadExtendedBlocks";
import PayloadRichText from "./PayloadRichText";
import WorkshopBlock from "./WorkshopBlocks";

function CmsButton({
  link,
  primary = false,
}: {
  link?: PayloadLink | null;
  primary?: boolean;
}) {
  const href = resolvePayloadLinkHref(link);
  if (!href || !link?.label) return null;
  return (
    <Button
      href={href}
      kind={primary || link.appearance !== "outline" ? "primary" : "secondary"}
      target={link.newTab ? "_blank" : undefined}
      rel={link.newTab ? "noreferrer" : undefined}
    >
      {link.label}
    </Button>
  );
}

function CmsMedia({ media }: { media?: PayloadMedia | string | number | null }) {
  if (!media || typeof media !== "object") return null;
  const src = resolvePayloadMediaUrl(media.url);
  if (!src) return null;

  return (
    <figure>
      {media.mimeType?.startsWith("video/") ? (
        <video controls className="w-full knglmrt-border" src={src}>
          <track kind="captions" />
        </video>
      ) : (
        // Payload-Medien können je nach Storage-Adapter ohne Maße ankommen.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={media.alt ?? ""}
          loading="lazy"
          className="h-auto w-full knglmrt-border object-cover"
        />
      )}
      {media.caption ? (
        <figcaption className="mt-2 text-sm text-muted-foreground">
          <PayloadRichText data={media.caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

const COLUMN_CLASSNAME = {
  full: "lg:col-span-12",
  half: "lg:col-span-6",
  oneThird: "lg:col-span-4",
  twoThirds: "lg:col-span-8",
} as const;

function ContentBlock({ block }: { block: PayloadBlock }) {
  return (
    <section className="knglmrt-border-t py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {(block.columns ?? []).map((column, index) => (
          <div
            key={column.id ?? index}
            className={COLUMN_CLASSNAME[column.size ?? "full"]}
          >
            <PayloadRichText
              data={column.richText}
              className="leading-[var(--ui-line-body)] text-foreground"
            />
            {column.enableLink ? (
              <div className="mt-4">
                <CmsButton link={column.link} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CallToActionBlock({ block }: { block: PayloadBlock }) {
  return (
    <section className="my-6 knglmrt-border bg-primary-soft px-5 py-5 md:flex md:items-center md:justify-between md:gap-8">
      <PayloadRichText
        data={block.richText}
        className="max-w-[620px] leading-[var(--ui-line-body)]"
      />
      {block.links?.length ? (
        <div className="mt-4 flex shrink-0 flex-wrap gap-2 md:mt-0 md:flex-col">
          {block.links.map((entry, index) => (
            <CmsButton
              key={`${entry.link?.label ?? "link"}-${index}`}
              link={entry.link}
              primary={index === 0}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

const getPostImage = (post: PayloadPost) => {
  if (post.heroImage && typeof post.heroImage === "object") {
    return post.heroImage;
  }
  if (post.meta?.image && typeof post.meta.image === "object") {
    return post.meta.image;
  }
  return null;
};

async function ArchiveBlock({ block }: { block: PayloadBlock }) {
  const posts = await loadPayloadArchivePosts(block);
  return (
    <section className="knglmrt-border-t py-6">
      <PayloadRichText
        data={block.introContent}
        className="mb-5 max-w-[640px] leading-[var(--ui-line-body)]"
      />
      {posts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => {
            const image = getPostImage(post);
            const src = resolvePayloadMediaUrl(image?.url);
            const href = resolvePayloadLinkHref({
              type: "reference",
              reference: { relationTo: "posts", value: post },
            });
            const content = (
              <>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={image?.alt ?? ""}
                    loading="lazy"
                    className="h-40 w-full border-b border-border object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center border-b border-border bg-muted knglmrt-caption text-muted-foreground">
                    Beitrag
                  </div>
                )}
                <div className="px-4 py-3">
                  <h3 className="text-lg">{post.title}</h3>
                  {post.meta?.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {post.meta.description}
                    </p>
                  ) : null}
                </div>
              </>
            );

            return href ? (
              <a
                key={post.id}
                href={href}
                className="knglmrt-border bg-card transition hover:bg-primary-soft"
              >
                {content}
              </a>
            ) : (
              <article key={post.id} className="knglmrt-border bg-card">
                {content}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="bg-muted px-4 py-3 text-muted-foreground">
          Zurzeit sind hier keine Beiträge veröffentlicht.
        </p>
      )}
    </section>
  );
}

function FormBlock({ block }: { block: PayloadBlock }) {
  if (!block.form || typeof block.form !== "object") return null;
  const form = block.form as CmsForm;
  if (form.id == null) return null;
  return (
    <section className="knglmrt-border-t py-6">
      {block.enableIntro ? (
        <PayloadRichText
          data={block.introContent}
          className="mb-5 max-w-[640px] leading-[var(--ui-line-body)]"
        />
      ) : null}
      <PayloadFormBlock form={form} />
    </section>
  );
}

async function PayloadBlockView({ block }: { block: PayloadBlock }) {
  switch (block.blockType) {
    case "workshopInfo":
    case "equipment":
      return <WorkshopBlock block={block} />;
    case "content":
      return <ContentBlock block={block} />;
    case "mediaBlock":
      return (
        <section className="knglmrt-border-t py-6">
          <CmsMedia media={block.media} />
        </section>
      );
    case "cta":
      return <CallToActionBlock block={block} />;
    case "archive":
      return <ArchiveBlock block={block} />;
    case "formBlock":
      return <FormBlock block={block} />;
    default:
      return <PayloadExtendedBlock block={block} />;
  }
}

export function PayloadHero({
  hero,
}: {
  hero?: {
    links?: Array<{ link?: PayloadLink | null }> | null;
    media?: PayloadMedia | string | number | null;
    richText?: import("@/lib/payload-cms").PayloadRichText | null;
    type?: "none" | "lowImpact" | "mediumImpact" | "highImpact";
  } | null;
}) {
  if (!hero || hero.type === "none") return null;
  const hasMedia = hero.media && typeof hero.media === "object";

  return (
    <section
      className={`mt-6 ${
        hero.type === "highImpact"
          ? "knglmrt-border bg-foreground p-5 text-background md:grid md:grid-cols-[minmax(0,1fr)_minmax(260px,42%)] md:items-center md:gap-6"
          : "knglmrt-border-t py-6"
      }`}
    >
      <div className={hasMedia && hero.type === "mediumImpact" ? "mb-5" : ""}>
        <PayloadRichText
          data={hero.richText}
          className="max-w-[640px] leading-[var(--ui-line-body)]"
        />
        {hero.links?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {hero.links.map((entry, index) => (
              <CmsButton
                key={`${entry.link?.label ?? "hero-link"}-${index}`}
                link={entry.link}
                primary={index === 0}
              />
            ))}
          </div>
        ) : null}
      </div>
      {hasMedia ? (
        <div className={hero.type === "highImpact" ? "mt-5 md:mt-0" : ""}>
          <CmsMedia media={hero.media} />
        </div>
      ) : null}
    </section>
  );
}

export default function PayloadBlocks({ blocks }: { blocks?: PayloadBlock[] | null }) {
  if (!blocks?.length) return null;
  return (
    <div>
      {blocks.map((block, index) => (
        <PayloadBlockView key={block.id ?? `${block.blockType}-${index}`} block={block} />
      ))}
    </div>
  );
}
