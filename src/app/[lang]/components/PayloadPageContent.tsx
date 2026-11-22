import type { Metadata } from "next";

import {
  resolvePayloadMediaUrl,
  type PayloadPage,
} from "@/lib/payload-cms";

import PageTitle from "./PageTitle";
import PayloadBlocks, { PayloadHero } from "../werkbereiche/PayloadBlocks";
import PageEditor from "./page-editor/PageEditor";

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
  backLink,
}: {
  page: PayloadPage;
  showTitle?: "always" | "never" | "withoutHero";
  backLink?: { href: string; label: string };
}) {
  const hasHero = Boolean(page.hero && page.hero.type !== "none");
  const shouldShowTitle =
    showTitle === "always" || (showTitle === "withoutHero" && !hasHero);

  return (
    <PageEditor key={page.id} pageId={page.id}><article>
      {shouldShowTitle ? (
        <PageTitle
          backLink={backLink}
          title={page.title}
          subTitle={page.meta?.description || undefined}
          className="mb-8"
        />
      ) : null}
      <PayloadHero hero={page.hero} />
      <PayloadBlocks blocks={page.layout} />
    </article></PageEditor>
  );
}
