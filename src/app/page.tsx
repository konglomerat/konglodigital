import Link from "next/link";
import Image from "next/image";
import Button from "./components/Button";
import heroHelloImage from "./hero-hello.jpg";
import inventoryImage from "./inventory.jpg";
import inventoryBwImage from "./inventory-bw.jpg";
import calendarImage from "./calendar.jpg";
import calendarBwImage from "./calendar-bw.jpg";
import print3dImage from "./3dprint.jpg";
import print3dBwImage from "./3dprint-bw.jpg";

type QuickAction = {
  href: string;
  title: string;
  description: string;
};

const quickActions: QuickAction[] = [
  {
    href: "/checkout",
    title: "Zum Warenkorb",
    description: "Direkt zu offenen Druckjobs und Produkten.",
  },
  {
    href: "/resources",
    title: "Inventar ansehen",
    description: "Werkzeuge, Materialien und Standorte durchsuchen.",
  },
  {
    href: "/calendar",
    title: "Kalender öffnen",
    description: "Termine, Workshops und Belegungen prüfen.",
  },
  /*
  {
    href: "/products",
    title: "Produkte finden",
    description: "Materialien und Services schnell auswählen.",
  },
  {
    href: "/account",
    title: "Mein Profil",
    description: "Persönliche Daten und Einstellungen verwalten.",
  },
  {
    href: "/invoices",
    title: "Rechnungen",
    description: "Rechnungen und Abrechnungen an einem Ort.",
  },*/
];

const workflowSteps = [
  {
    title: "1. Entdecken",
    text: "Finde Werkzeuge, freie Termine und passende Produkte.",
  },
  {
    title: "2. Nutzen",
    text: "Starte deinen Prozess mit wenigen Klicks und klaren Wegen.",
  },
  {
    title: "3. Verwalten",
    text: "Behalte Käufe, Beiträge und Unterlagen im Blick.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:gap-10 md:py-14">
      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_420px] md:items-center md:gap-8 lg:grid-cols-[minmax(0,1fr)_680px]">
        <div className="order-2 md:order-1">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">
            Willkommen
          </p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-widest leading-none text-zinc-900 md:text-5xl">
            Konglo
            <br />
            digital
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-600 md:text-base">
            Hier findest du alles zur Werkstatt, Self-Service und Verwaltung.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/resources" kind="primary" size="medium">
              Zu Inventar
            </Button>
            <Button href="/calendar" kind="secondary" size="medium">
              Termine ansehen
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
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_30px_10px_#fafafa,inset_0_30px_52px_#fafafa] dark:shadow-[inset_0_0_20px_10px_#09090b,inset_0_20px_72px_#09090b]" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">
              Schnellzugriff
            </h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => {
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {action.href === "/checkout" ? (
                  <div className="relative">
                    <Image
                      src={print3dBwImage}
                      alt="3D-Druck"
                      className="h-auto w-full multiply negative-multiply"
                    />
                    <Image
                      src={print3dImage}
                      alt="3D-Druck"
                      className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 multiply negative-multiply"
                    />
                  </div>
                ) : action.href === "/resources" ? (
                  <div className="relative">
                    <Image
                      src={inventoryBwImage}
                      alt="Inventar"
                      className="h-auto w-full multiply negative-multiply"
                    />
                    <Image
                      src={inventoryImage}
                      alt="Inventar"
                      className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 multiply negative-multiply"
                    />
                  </div>
                ) : action.href === "/calendar" ? (
                  <div className="relative">
                    <Image
                      src={calendarBwImage}
                      alt="Kalender"
                      className="h-auto w-full multiply negative-multiply"
                    />
                    <Image
                      src={calendarImage}
                      alt="Kalender"
                      className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 multiply negative-multiply"
                    />
                  </div>
                ) : null}

                <div className="px-5 pb-4">
                  <h3 className="text-base font-semibold text-blue-600 group-hover:text-blue-700">
                    {action.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
