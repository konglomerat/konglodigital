import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/server";
import { loadPayloadPage } from "@/lib/payload-cms";
import PayloadPageContent, {
  payloadPageMetadata,
} from "../components/PayloadPageContent";

export async function generateMetadata(): Promise<Metadata> {
  return payloadPageMetadata(await loadPayloadPage("mitglied-werden"), {
    title: "Mitglied werden",
  });
}

export default async function MembershipPage() {
  const page = await loadPayloadPage("mitglied-werden");
  if (page) return <PayloadPageContent page={page} />;

  // Keep the published CMS page authoritative. Until one is available, the
  // association's existing membership page provides the application forms.
  const locale = await getRequestLocale();
  redirect(
    `https://konglomerat.org${locale === "en" ? "/en" : ""}/der-verein/mitglied-werden`,
  );
}
