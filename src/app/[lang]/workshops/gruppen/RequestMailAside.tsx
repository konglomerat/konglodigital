"use client";

// „Lieber per Mail?“ — Nebenspalte neben dem Anfrageformular. Client-Komponente,
// damit sie in der Übersicht (Client) und der Detailseite (Server) läuft.
import Divider from "@/components/knglmrt/Divider";
import Hand from "@/components/knglmrt/Hand";
import { useI18n } from "@/i18n/client";
import { WORKSHOP_BOOKING_EMAIL, WORKSHOP_REQUEST_EMAIL } from "@/lib/workshops";

export default function RequestMailAside({
  mailSubject = "Workshop-Anfrage",
}: {
  mailSubject?: string;
}) {
  const { tx } = useI18n();
  return (
    <aside className="flex min-w-0 flex-col gap-5 pt-1">
      <div className="bg-muted p-7">
        <Hand number={4} size={72} title="" />
        <h3 className="knglmrt-card-title m-0 mt-3.5">{tx("Lieber per Mail?", "de")}</h3>
        <p className="mb-0 mt-2 text-pretty">
          {tx("Formulare sind nicht jedermanns Sache. Schreib einfach formlos an:", "de")}
        </p>
        <a
          href={`mailto:${WORKSHOP_REQUEST_EMAIL}?subject=${encodeURIComponent(mailSubject)}`}
          className="knglmrt-num mt-3 inline-block font-bold text-primary hover:text-[var(--link-color-hover)]"
        >
          {WORKSHOP_REQUEST_EMAIL}
        </a>
        <div className="mt-5 text-primary">
          <Divider number={2} />
        </div>
        <p className="mb-0 mt-4 text-muted-foreground">
          {tx("Fragen zu einer Buchung oder Stornierung:", "de")}
          <br />
          <a
            href={`mailto:${WORKSHOP_BOOKING_EMAIL}`}
            className="knglmrt-num text-primary hover:text-[var(--link-color-hover)]"
          >
            {WORKSHOP_BOOKING_EMAIL}
          </a>
        </p>
      </div>
      <p className="m-0 text-muted-foreground">
        Konglomerat e.V.
        <br />
        Jagdweg 1–3, 01159 Dresden
      </p>
    </aside>
  );
}
