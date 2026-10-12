// Existing Werkbereiche and additional published CMS Werkbereich pages.
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import { isSupportedLocale, localizePathname } from "@/i18n/config";
import { getPayloadPagePath } from "@/lib/payload-page-path";
import { findVereinsprojekt, findWerkbereich } from "@/lib/werkbereiche";
import { loadPayloadWerkbereichPage } from "@/lib/payload-cms";
import WerkbereichCmsPage, {
  getWerkbereichCmsMetadata,
} from "../WerkbereichCmsPage";

type PageProps = {
  params: Promise<{ slug: string; lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const path = getPayloadPagePath(`werkbereich-${slug}`);
  if (!path) notFound();
  if (path !== `/werkbereiche/${slug}`) permanentRedirect(localizePathname(path, lang));
  const werkbereich = findWerkbereich(slug);
  const projekt = findVereinsprojekt(slug);
  const entry = werkbereich ?? projekt;
  return getWerkbereichCmsMetadata({
    slug,
    fallbackTitle: entry?.name ?? "Werkbereich",
    fallbackDescription: werkbereich?.description,
  });
}

export default async function WerkbereichPage({
  params,
}: PageProps) {
  const { slug, lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const path = getPayloadPagePath(`werkbereich-${slug}`);
  if (!path) notFound();
  if (path !== `/werkbereiche/${slug}`) permanentRedirect(localizePathname(path, lang));
  const werkbereich = findWerkbereich(slug);
  const projekt = findVereinsprojekt(slug);
  const entry = werkbereich ?? projekt;
  const page = !entry ? await loadPayloadWerkbereichPage(slug) : null;
  if (!entry && !page) notFound();

  return (
    <WerkbereichCmsPage
      slug={slug}
      fallbackTitle={entry?.name ?? page!.title}
      fallbackDescription={werkbereich?.description}
    />
  );
}
