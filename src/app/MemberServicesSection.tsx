// „Für Mitglieder": die Self-Services als farbige Kacheln unter dem
// Mitglieder-Kopf der Startseite. Was es noch nicht gibt, steht schon da,
// trägt aber „Coming Soon" und führt nirgendwohin.
import Link from "next/link";
import Badge from "@/components/knglmrt/Badge";
import Divider from "@/components/knglmrt/Divider";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";

type Service = {
  title: string;
  description: string;
  /** Ohne Ziel ist der Service noch in Arbeit. */
  href: string | null;
  tint: string;
};

// Die Kachelfarben laufen reihum wie im Entwurf: rosa, gelb, grau, blau.
const TINTS = [
  "bg-[var(--knglmrt-paper-pink)] dark:bg-primary-soft",
  "bg-warning-soft",
  "bg-muted",
  "bg-info-soft",
];


export default async function MemberServicesSection() {
  const { tx, locale } = await getServerI18n();
  const href = (path: string) => localizePathname(path, locale);

  const services: Service[] = [
    {
      title: tx("Ehrenamtsbonus beantragen", "de"),
      description: tx(
        "Stunden für den Verein auf den Beitrag anrechnen.",
        "de",
      ),
      href: href("/account/ehrenamtsbonus"),
    },
    {
      title: tx("Rückerstattung einreichen", "de"),
      description: tx("Beleg hochladen, Geld zurück.", "de"),
      href: href("/account/rueckerstattung"),
    },
    {
      title: tx("Werkzeug ausleihen", "de"),
      description: tx("Aus dem Inventar mit nach Hause.", "de"),
      href: href("/resources"),
    },
    {
      title: tx("Einweisung anfragen", "de"),
      description: tx("Für neue Werkbereiche freischalten lassen.", "de"),
      href: null,
    },
    {
      title: tx("Schaden melden", "de"),
      description: tx("Etwas kaputt? Kurz Bescheid geben.", "de"),
      href: null,
    },
  ].map((service, index) => ({
    ...service,
    tint: TINTS[index % TINTS.length],
  }));

  return (
    <section
      aria-labelledby="fuer-mitglieder"
      className="px-6 py-8 md:px-10 md:py-10"
    >
      <h2 id="fuer-mitglieder" className="mb-1.5">
        {tx("Für Mitglieder", "de")}
      </h2>
      <div className="mb-7 max-w-[520px]">
        <Divider number={5} height={14} color="var(--primary)" repeat />
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-5">
        {services.map((service) => {
          const content = (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <span className="knglmrt-card-title text-foreground">
                  {service.title}
                </span>
                {service.href ? null : (
                  <Badge tone="neu">{tx("Coming Soon", "de")}</Badge>
                )}
              </span>
              <span className="mt-1 block text-muted-foreground">
                {service.description}
              </span>
            </>
          );

          return (
            <li key={service.title} className="flex">
              {service.href ? (
                <Link
                  href={service.href}
                  className={`flex w-full flex-col px-4 py-3.5 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--knglmrt-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${service.tint}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  aria-disabled
                  className={`flex w-full flex-col px-4 py-3.5 opacity-70 ${service.tint}`}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
