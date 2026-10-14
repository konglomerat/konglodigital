import type { Metadata } from "next";
import type { ReactNode } from "react";

import { loadPayloadPage } from "@/lib/payload-cms";

import { payloadPageMetadata } from "../components/PayloadPageContent";
import PayloadBlocks, { PayloadHero } from "../werkbereiche/PayloadBlocks";

const loadMonatsbeitragPage = () =>
  loadPayloadPage("monatsbeitrag", "zugangskarte");

export async function generateMetadata(): Promise<Metadata> {
  return payloadPageMetadata(await loadMonatsbeitragPage(), {
    title: "Monatsbeitrag und Zugangskarte",
    description: "Zugangskarte auswählen und Monatsbeitrag verwalten.",
  });
}

export default async function MonatsbeitragLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const page = await loadMonatsbeitragPage();

  return (
    <>
      {children}
      {page ? (
        <section
          aria-label="Weitere Informationen"
          className="mt-12 knglmrt-border-t pt-2"
        >
          {/* Auswahl und Warenkorb bleiben interaktiv; erklärende Inhalte,
              Bilder, CTAs und Formulare lassen sich darunter frei pflegen. */}
          <PayloadHero hero={page.hero} />
          <PayloadBlocks blocks={page.layout} />
        </section>
      ) : null}
    </>
  );
}
