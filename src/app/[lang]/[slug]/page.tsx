import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { isSupportedLocale, localizePathname } from "@/i18n/config";
import { loadPayloadPage } from "@/lib/payload-cms";
import { getPayloadPagePath } from "@/lib/payload-page-path";
import PayloadPageContent, {
  payloadPageMetadata,
} from "../components/PayloadPageContent";

type PageProps = {
  params: Promise<{ lang: string; slug: string }>;
};

async function loadPage(params: PageProps["params"]) {
  const { lang, slug } = await params;
  const pathname = getPayloadPagePath(slug);
  if (!isSupportedLocale(lang) || !pathname) notFound();

  // Keep CMS aliases and Werkbereich documents on their established routes.
  // Static application routes take precedence over this dynamic route.
  if (pathname !== `/${slug}`) {
    permanentRedirect(localizePathname(pathname, lang));
  }

  const page = await loadPayloadPage(slug);
  if (!page) notFound();
  return page;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await loadPage(params);
  return payloadPageMetadata(page, { title: page.title });
}

export default async function CmsPage({ params }: PageProps) {
  const page = await loadPage(params);
  return <PayloadPageContent page={page} />;
}
