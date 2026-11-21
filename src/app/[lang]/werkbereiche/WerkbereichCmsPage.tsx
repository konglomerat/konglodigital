import type { Metadata } from "next";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import {
  loadPayloadWerkbereichPage,
  resolvePayloadMediaUrl,
} from "@/lib/payload-cms";

import { werkbereichDefaultBlocks } from "@/lib/werkbereich-content";
import { getServerSession } from "@/lib/server-session";

import PageTitle from "../components/PageTitle";
import PayloadBlocks, { PayloadHero } from "./PayloadBlocks";
import WerkbereichSideNav from "./WerkbereichSideNav";
import WerkbereichSidebar from "./WerkbereichSidebar";
import PageEditor from "../components/page-editor/PageEditor";

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
  const printing = slug === "3d-druck";
  const user = printing ? (await getServerSession()).user : null;
  const blocks = page ? page.layout : werkbereichDefaultBlocks(slug);

  return (
    <PageEditor key={page?.id ?? slug} pageId={page?.id}>
      <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)] md:gap-x-12 xl:gap-x-16">
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
          <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-x-16 2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:gap-x-20">
            <div className="min-w-0">
              {printing && user ? (
                <PayloadBlocks blocks={blocks} blockGroup="self-service" />
              ) : null}
              <PayloadHero hero={page?.hero} />
              <PayloadBlocks
                blocks={blocks}
                blockGroup={printing ? "content" : undefined}
              />
            </div>
            <WerkbereichSidebar
              blocks={page?.sidebarLayout}
              werkbereich={slug}
            />
          </div>
        </article>
      </div>
    </PageEditor>
  );
}
