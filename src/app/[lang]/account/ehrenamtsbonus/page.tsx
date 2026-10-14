// Ehrenamtsbonus aus Mitgliedersicht — eigene Unterseite von /account, per
// Kachel dort verlinkt. Jahresbeitrag-Status, aktueller Zugang und die
// eigenen Anträge kommen aus der Server-Hülle: der Kopf des Formulars ist
// read-only und soll ohne Nachladen im ersten Paint stehen.
import type { Metadata } from "next";
import { Suspense } from "react";

import Button from "@/components/knglmrt/Button";
import PageTitle from "@/app/[lang]/components/PageTitle";
import { listOwnRequests } from "@/lib/ehrenamtsbonus";
import { resolveEhrenamtsbonusContext } from "@/lib/ehrenamtsbonus-context";
import { getServerSession } from "@/lib/server-session";

import EhrenamtsbonusClient from "./EhrenamtsbonusClient";
import EhrenamtsbonusSkeleton from "./EhrenamtsbonusSkeleton";

export const metadata: Metadata = {
  title: "Ehrenamtsbonus",
};

export const dynamic = "force-dynamic";

async function EhrenamtsbonusContent() {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle
          backLink={{ href: "/account", label: "Zurück" }}
          title="Ehrenamtsbonus"
          titleClassName="text-[length:var(--ui-size-section)]"
        />
        <section className="knglmrt-border bg-card p-[18px]">
          <h2 className="mb-1">Anmeldung erforderlich</h2>
          <p className="mb-4 text-muted-foreground">
            Bitte melde dich an, um einen Ehrenamtsbonus zu beantragen.
          </p>
          <Button
            size="small"
            href="/login?redirectedFrom=/account/ehrenamtsbonus"
            kind="primary"
          >
            Anmelden
          </Button>
        </section>
      </div>
    );
  }

  // Beides hängt am selben Profil, aber an verschiedenen Abfragen — parallel
  // spart einen Roundtrip vor dem ersten Paint. Fehlt die Tabelle noch, kommt
  // die Antragsliste leer zurück statt zu brechen.
  const [context, requests] = await Promise.all([
    resolveEhrenamtsbonusContext(supabase, user.id),
    listOwnRequests(supabase, user.id),
  ]);

  return (
    <EhrenamtsbonusClient context={context} initialRequests={requests} />
  );
}

export default function EhrenamtsbonusPage() {
  return (
    <Suspense fallback={<EhrenamtsbonusSkeleton />}>
      <EhrenamtsbonusContent />
    </Suspense>
  );
}
