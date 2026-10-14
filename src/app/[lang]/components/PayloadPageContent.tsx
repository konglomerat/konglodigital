import type { Metadata } from "next";

import {
  resolvePayloadMediaUrl,
  type PayloadPage,
} from "@/lib/payload-cms";

import PageTitle from "./PageTitle";
import PayloadBlocks, { PayloadHero } from "../werkbereiche/PayloadBlocks";

export function payloadPageMetadata(
  page: PayloadPage | null,
  fallback: { title: string; description?: string },
): Metadata {
  const metaImage =
    page?.meta?.image && typeof page.meta.image === "object"
      ? resolvePayloadMediaUrl(page.meta.image.url)
      : null;

  return {
    title: page?.meta?.title || page?.title || fallback.title,
    description: page?.meta?.description || fallback.description,
    openGraph: metaImage ? { images: [{ url: metaImage }] } : undefined,
  };
}

export default function PayloadPageContent({
  page,
  showTitle = "withoutHero",
}: {
  page: PayloadPage;
  showTitle?: "always" | "never" | "withoutHero";
}) {
  const hasHero = Boolean(page.hero && page.hero.type !== "none");
  const shouldShowTitle =
    showTitle === "always" || (showTitle === "withoutHero" && !hasHero);

  return (
    <article>
      {shouldShowTitle ? (
        <PageTitle
          title={page.title}
          subTitle={page.meta?.description || undefined}
          className="mb-8"
        />
      ) : null}
      <PayloadHero hero={page.hero} />
      <PayloadBlocks blocks={page.layout} />
    </article>
  );
}
