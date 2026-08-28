import Image from "next/image";
import Divider from "@/components/knglmrt/Divider";
import Button from "@/components/knglmrt/Button";
import ShowcaseOfTheMonthSection from "./ShowcaseOfTheMonthSection";
import ResourceOfTheMonthSection from "./ResourceOfTheMonthSection";
import NewsSection from "./NewsSection";
import TerrazzoParallax from "./TerrazzoParallax";
import heroHelloImage from "./hero-hello.jpg";
import { getServerI18n } from "@/i18n/server";

export default async function Home() {
  const { tx } = await getServerI18n();
  return (
    <>
      <TerrazzoParallax />
      <section className="frontpage-hero knglmrt-terrazzo-fein-rosa relative left-1/2 -mt-4 w-[100dvw] -translate-x-1/2 knglmrt-border-b py-8 md:-mt-10 md:py-11">
        <div className="mx-auto w-full max-w-[1600px] px-3 md:px-7">
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

      <ShowcaseOfTheMonthSection />

      <NewsSection />

      <ResourceOfTheMonthSection />

      <section className="knglmrt-terrazzo-hellgelb relative left-1/2 w-[100dvw] -translate-x-1/2 knglmrt-border-t px-3 py-9 text-center md:px-7">
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
    </>
  );
}
