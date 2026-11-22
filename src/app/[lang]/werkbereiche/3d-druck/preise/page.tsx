import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSupportedLocale, localizePathname } from "@/i18n/config";
import { loadPayloadPage } from "@/lib/payload-cms";
import PayloadPageContent, { payloadPageMetadata } from "../../../components/PayloadPageContent";

type PageProps = { params: Promise<{ lang: string }> };

async function loadPrices(params: PageProps["params"]) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const page = await loadPayloadPage("3d-druck-preise");
  if (!page) notFound();
  return { page, lang };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { page } = await loadPrices(params);
  return payloadPageMetadata(page, { title: "Preise für 3D-Druck" });
}

export default async function PrintingPricesPage({ params }: PageProps) {
  const { page, lang } = await loadPrices(params);
  return (
    <div className="mx-auto max-w-4xl [&_p+h2]:mt-8">
      <PayloadPageContent
        page={page}
        showTitle="always"
        backLink={{ href: localizePathname("/werkbereiche/3d-druck", lang), label: "Zurück zum 3D-Druck" }}
      />
    </div>
  );
}
