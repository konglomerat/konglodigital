"use client";

// „Workshops anfragen“: Karten der Gruppen-Workshops (jede führt auf ihre
// Detailseite), eine dunkle Karte für eigene Ideen und das Anfrageformular
// für individuelle Workshops, das sich darunter über die ganze Breite öffnet.
import { useRef, useState } from "react";

import Button from "@/components/knglmrt/Button";
import Face from "@/components/knglmrt/Face";
import { useI18n } from "@/i18n/client";
import type { GroupWorkshop } from "@/lib/group-workshops";
import GroupRequestForm from "./gruppen/GroupRequestForm";
import GroupWorkshopCard from "./gruppen/GroupWorkshopCard";
import RequestMailAside from "./gruppen/RequestMailAside";

export default function WorkshopGroups({ workshops }: { workshops: GroupWorkshop[] }) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () =>
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLElement>("input, button")?.focus({
        preventScroll: true,
      });
    }, 50);

  return (
    <div className="mt-11 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-7">
      {workshops.map((workshop) => (
        <GroupWorkshopCard key={workshop.slug} workshop={workshop} />
      ))}

      <div className="flex min-h-full flex-col bg-[var(--knglmrt-dark-100)] text-[var(--knglmrt-paper)]">
        <div className="flex aspect-[3/2] items-center justify-center border-b-[0.5px] border-[var(--knglmrt-dark-60)]">
          <Face number={21} size={120} color="var(--knglmrt-paper)" title="" />
        </div>
        <div className="flex flex-1 flex-col gap-2.5 px-[22px] pb-6 pt-[22px]">
          <h3 className="knglmrt-card-title m-0">{tx("Eure eigene Idee?", "de")}</h3>
          <p className="m-0 text-pretty">
            {tx(
              "Nichts Passendes dabei? Erzählt uns, was ihr vorhabt – wir stellen einen Workshop für eure Gruppe zusammen.",
              "de",
            )}
          </p>
          <div className="mt-auto flex pt-2.5">
            <Button
              kind="primary"
              aria-expanded={open}
              aria-controls="anfrage"
              onClick={() => {
                const next = !open;
                setOpen(next);
                if (next) scrollToForm();
              }}
            >
              {open ? tx("Formular schließen", "de") : tx("Anfrage stellen", "de")}
            </Button>
          </div>
        </div>
      </div>

      {open ? (
        <div
          id="anfrage"
          ref={formRef}
          className="col-span-full scroll-mt-[90px] bg-card px-5 py-8 md:px-8 md:py-9"
        >
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <h3 className="m-0 font-[family-name:var(--font-display)] text-[32px] font-black leading-none">
                {tx("Individueller Workshop", "de")}
              </h3>
              <p className="mb-0 mt-3 max-w-[560px] text-muted-foreground">
                {tx(
                  "Erzähl uns kurz, wer ihr seid und was ihr vorhabt. Wir melden uns innerhalb einer Woche.",
                  "de",
                )}
              </p>
              <GroupRequestForm options={workshops.map((workshop) => workshop.title)} />
            </div>
            <RequestMailAside />
          </div>
        </div>
      ) : null}
    </div>
  );
}
