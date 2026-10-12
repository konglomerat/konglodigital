import type { Metadata } from "next";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import {
  loadPayloadWerkbereichPage,
  resolvePayloadMediaUrl,
} from "@/lib/payload-cms";

import { werkbereichDefaultBlocks } from "@/lib/werkbereich-content";

import PageTitle from "../components/PageTitle";
import PayloadBlocks, { PayloadHero } from "./PayloadBlocks";
import WerkbereichSideNav from "./WerkbereichSideNav";

export const getWerkbereichCmsMetadata = async ({
  slug,
  fallbackTitle,
  fallbackDescription,
}: {
  slug: string;
  fallbackTitle: string;
  fallbackDescription?: string;
}): Promise<Metadata> => {
  const page = await loadPayloadWerkbereichPage(slug);
  const metaImage =
    page?.meta?.image && typeof page.meta.image === "object"
      ? resolvePayloadMediaUrl(page.meta.image.url)
      : null;

  return {
    title: page?.meta?.title || page?.title || fallbackTitle,
    description: page?.meta?.description || fallbackDescription,
    openGraph: metaImage ? { images: [{ url: metaImage }] } : undefined,
  };
};

export default async function WerkbereichCmsPage({
  slug,
  fallbackTitle,
  fallbackDescription,
}: {
  slug: string;
  fallbackTitle: string;
  fallbackDescription?: string;
}) {
  const page = await loadPayloadWerkbereichPage(slug);

  return (
    <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)]">
      <WerkbereichSideNav />
      <article className="min-w-0">
        <PageTitle
          backLink={{
            href: "/werkbereiche",
            label: "Zur Übersicht",
            icon: faArrowLeft,
          }}
          title={page?.title || fallbackTitle}
          subTitle={page?.meta?.description || fallbackDescription}
        />
        <PayloadHero hero={page?.hero} />
        <PayloadBlocks blocks={page ? page.layout : werkbereichDefaultBlocks(slug)} />
      </article>
    </div>
  );
}
