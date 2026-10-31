import type { Metadata } from "next";

import OAuthConsentClient from "./OAuthConsentClient";

export const metadata: Metadata = {
  title: "Anmeldung bestätigen",
};

type PageProps = {
  searchParams: Promise<{ authorization_id?: string }>;
};

export default async function OAuthConsentPage({ searchParams }: PageProps) {
  const { authorization_id: authorizationId = "" } = await searchParams;

  return <OAuthConsentClient authorizationId={authorizationId} inventoryClientId={process.env.OPENINVENTORY_OAUTH_CLIENT_ID?.trim() ?? ""} />;
}
