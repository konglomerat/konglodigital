import Link from "next/link";
import Image from "next/image";
import Divider from "@/components/knglmrt/Divider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Button from "./[lang]/components/Button";
import ShowcaseOfTheMonthSection from "./ShowcaseOfTheMonthSection";
import ResourceOfTheMonthSection from "./ResourceOfTheMonthSection";
import heroHelloImage from "./hero-hello.jpg";
import inventoryImage from "./inventory.jpg";
import inventoryBwImage from "./inventory-bw.jpg";
import calendarImage from "./calendar.jpg";
import calendarBwImage from "./calendar-bw.jpg";
import print3dImage from "./3dprint.jpg";
import print3dBwImage from "./3dprint-bw.jpg";
import showcasesImage from "./showcase.jpg";
import showcasesBwImage from "./showcase-bw.jpg";
import { getServerI18n } from "@/i18n/server";

type QuickAction = {
  href: string;
  title: string;
  description: string;
};

const quickActionImages: Record<
  string,
  { bw: typeof print3dBwImage; color: typeof print3dImage; alt: string }
> = {
  "/checkout": { bw: print3dBwImage, color: print3dImage, alt: "3D-Druck" },
  "/resources": { bw: inventoryBwImage, color: inventoryImage, alt: "Inventar" },
  "/calendar": { bw: calendarBwImage, color: calendarImage, alt: "Kalender" },
  "/showcase": {
    bw: showcasesBwImage,
    color: showcasesImage,
    alt: "Hier entstanden",
  },
};

export default async function Home() {
  const { tx } = await getServerI18n();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);

  const quickActions: QuickAction[] = [
    {
      href: "/checkout",
      title: tx("Zum Warenkorb", "de"),
      description: tx("Direkt zu offenen Druckjobs und Produkten.", "de"),
    },
    {
      href: "/resources",
      title: tx("Inventar ansehen", "de"),
      description: tx(
        "Werkzeuge, Materialien und Standorte durchsuchen.",
        "de",
      ),
    },
    {
      href: "/calendar",
      title: tx("Kalender öffnen", "de"),
      description: tx("Termine, Workshops und Belegungen prüfen.", "de"),
    },
    {
      href: "/showcase",
      title: tx("Hier entstanden", "de"),
      description: tx(
        "Umbauten, Prototypen und Werkstattprojekte ansehen.",
        "de",
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-8 md:gap-10">
      <section className="knglmrt-terrazzo-fein-rosa relative left-1/2 -mt-4 w-[100dvw] -translate-x-1/2 border-b border-foreground py-8 md:-mt-10 md:py-11">
        <div className="mx-auto w-full max-w-[1240px] px-3 md:px-7">
          <div className="knglmrt-panel grid h-fit gap-8 p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-center md:gap-10 md:p-10">
            <div className="order-2 md:order-1">
              <p className="knglmrt-eyebrow">{tx("Willkommen", "de")}</p>
              <h1 className="mt-3 whitespace-nowrap text-[clamp(28px,7.5vw,40px)] leading-[1.05] md:text-[56px] md:leading-[52px]">
                Konglomerat e.V.
              </h1>
              <p className="knglmrt-lead mt-4 max-w-[420px]">
                {tx(
                  "Hier findest du alles zur Werkstatt, Self-Service und Verwaltung.",
                  "de",
                )}
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button href="/werkbereiche" kind="primary">
                  {tx("Werkbereiche ansehen", "de")}
                </Button>
                <Button href="/verein" kind="secondary">
                  {tx("Über uns", "de")}
                </Button>
              </div>
            </div>

            <div className="order-1 mx-auto w-full max-w-[620px] md:order-2 md:max-w-none">
              <Image
                src={heroHelloImage}
                alt="Willkommensgrafik"
                priority
                className="h-auto w-full object-cover multiply negative-multiply md:hidden"
              />
              <div className="relative hidden md:-my-6 md:block lg:-my-10">
                <video
                  autoPlay
                  muted
                  playsInline
                  loop
                  className="h-auto w-full object-cover invert-in-dark"
                >
                  <source src="/heroanimation.mp4" type="video/mp4" />
                </video>
                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_30px_10px_#fff,inset_0_30px_52px_#fff] dark:shadow-[inset_0_0_20px_10px_#09090b,inset_0_20px_72px_#09090b]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isAuthenticated ? (

        <section className="bg-primary-soft px-6 py-7 md:px-8">
          <h2 className="mb-1.5 text-primary">
            {tx("Neu hier? So funktioniert die Registrierung", "de")}
          </h2>
          <div className="mb-5 max-w-[520px]">
            <Divider number={4} height={9} color="var(--foreground)" />
          </div>
          <div className="grid gap-6 md:grid-cols-3 md:gap-7">
            <article className="flex flex-col gap-1.5">
              <h3 className="knglmrt-caption text-[var(--knglmrt-brown-100)]">
                {tx("Wer kann sich registrieren?", "de")}
              </h3>
              <p>
                {tx(
                  "Jedes Konglomeratmitglied kann sich registrieren, auf Nachfrage auch andere Personen.",
                  "de",
                )}
              </p>
            </article>

            <article className="flex flex-col gap-1.5">
              <h3 className="knglmrt-caption text-[var(--knglmrt-brown-100)]">
                {tx("Automatische Freischaltung", "de")}
              </h3>
              <p>
                {tx(
                  "Nutze bei der Registrierung die E-Mail-Adresse, mit der du dich beim Konglomerat angemeldet hast.",
                  "de",
                )}
              </p>
            </article>

            <article className="flex flex-col gap-1.5">
              <h3 className="knglmrt-caption text-[var(--knglmrt-brown-100)]">
                {tx("Wenn es nicht klappt", "de")}
              </h3>
              <p>
                {tx("Schreib uns an", "de")}{" "}
                <a
                  href="mailto:vorstand@konglomerat.org"
                  className="font-bold text-primary hover:text-[var(--knglmrt-brown-100)]"
                >
                  vorstand@konglomerat.org
                </a>{" "}
                {tx(
                  ", wenn du eine andere E-Mail-Adresse nutzen möchtest.",
                  "de",
                )}
              </p>
            </article>
          </div>

          <div className="mt-6">
            <Button href="/register" kind="primary">
              {tx("Jetzt registrieren", "de")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="bg-primary-soft px-6 py-8 md:px-10 md:py-10">
        <h2 className="mb-1.5 text-primary">
          {tx("Neu hier? So wirst du Mitglied", "de")}
        </h2>
        <div className="mb-7 max-w-[520px]">
          <Divider number={3} height={14} color="var(--primary)" />
        </div>

        <ol className="grid gap-7 md:grid-cols-3 md:gap-10">
          {[
            {
              title: tx("Kennenlernen", "de"),
              description: tx(
                "Komm zum offenen Abend, schau dich um und sprich mit uns.",
                "de",
              ),
            },
            {
              title: tx("Antrag stellen", "de"),
              description: tx(
                "Mitgliedsantrag ausfüllen, der Vorstand bestätigt die Aufnahme.",
                "de",
              ),
            },
            {
              title: tx("Einweisung erhalten", "de"),
              description: tx(
                "Sicherheitseinweisung an den Maschinen, danach hast du Zugang.",
                "de",
              ),
            },
          ].map((step, index) => (
            <li key={step.title} className="flex flex-col gap-1.5">
              <span className="font-display text-[28px] leading-[28px] text-primary">
                {index + 1}
              </span>
              <h3 className="knglmrt-caption text-[var(--knglmrt-brown-100)]">
                {step.title}
              </h3>
              <p>{step.description}</p>
              {index === 1 ? (
                <div className="mt-3">
                  <Button href="/mitglied-werden" kind="emphasis" size="large">
                    {tx("Online Antrag", "de")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3.5">{tx("Schnellzugriff", "de")}</h2>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => {
            const image = quickActionImages[action.href];

            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-2.5 border border-foreground bg-card p-2 transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {image ? (
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden border border-foreground">
                    <Image
                      src={image.bw}
                      alt={image.alt}
                      className="h-full w-full object-cover multiply negative-multiply"
                    />
                    <Image
                      src={image.color}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 multiply negative-multiply"
                    />
                  </div>
                ) : null}

                <h3 className="knglmrt-card-title text-[13px] leading-4 text-primary">
                  {action.title}
                </h3>
              </Link>
            );
          })}
        </div>
      </section>

      <ShowcaseOfTheMonthSection />

      <ResourceOfTheMonthSection />

      <section className="knglmrt-terrazzo-hellgelb relative left-1/2 -mb-4 w-[100dvw] -translate-x-1/2 border-t border-foreground px-3 py-9 text-center md:-mb-10 md:px-7">
        <p className="knglmrt-caption mb-2 text-[var(--knglmrt-brown-100)]">
          {tx("Mit ❤️ im Ehrenamt entwickelt", "de")}
        </p>
        <a
          href="https://konglomerat.org"
          target="_blank"
          rel="noopener noreferrer"
          className="font-display text-[23px] leading-[26px] text-primary transition hover:text-[var(--knglmrt-brown-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          konglomerat.org
        </a>
      </section>
    </div>
  );
}
