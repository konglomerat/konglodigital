// „Ablauf“ und „Gut zu wissen“ auf rosa Grund, dazu der Hinweis, wer den
// Workshop leitet.
import Face from "@/components/knglmrt/Face";
import { getServerI18n } from "@/i18n/server";
import type { GroupWorkshop } from "@/lib/group-workshops";

export default async function GroupWorkshopSchedule({
  workshop,
  className,
  innerClassName,
}: {
  workshop: GroupWorkshop;
  className?: string;
  innerClassName?: string;
}) {
  const { tx } = await getServerI18n();
  const hasSchedule = workshop.schedule.length > 0;
  const hasInfos = workshop.infos.length > 0 || Boolean(workshop.host);
  if (!hasSchedule && !hasInfos) return null;

  return (
    <section
      aria-labelledby="ablauf-titel"
      className={`${className ?? ""} bg-[var(--knglmrt-paper-pink)] dark:bg-primary-soft`}
    >
      <div
        className={`${innerClassName ?? ""} grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-12 py-16`}
      >
        {hasSchedule ? (
          <div className="min-w-0">
            <h2 id="ablauf-titel" className="m-0">
              {tx("Ablauf", "de")}
            </h2>
            {workshop.scheduleNote ? (
              <p className="mb-0 mt-2.5 text-pretty text-muted-foreground">
                {workshop.scheduleNote}
              </p>
            ) : null}
            <ol className="m-0 mt-5 list-none border-t border-foreground p-0">
              {workshop.schedule.map((step) => (
                <li
                  key={`${step.time}-${step.title}`}
                  className="flex gap-5 border-b border-[var(--knglmrt-dark-60)] py-3.5"
                >
                  <span className="knglmrt-num w-16 flex-none pt-0.5 font-bold">
                    {step.time}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold">{step.title}</div>
                    <div className="mt-0.5 text-pretty text-muted-foreground">
                      {step.text}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {hasInfos ? (
          <div className="flex min-w-0 flex-col gap-8">
            {workshop.infos.length ? (
              <div>
                <h2 className="m-0">{tx("Gut zu wissen", "de")}</h2>
                <dl className="m-0 mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5">
                  {workshop.infos.map((info) => (
                    <div key={info.label} className="contents">
                      <dt className="font-bold">{info.label}</dt>
                      <dd className="m-0 text-pretty">{info.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {workshop.host ? (
              <div className="flex items-center gap-4 bg-card px-5 py-[18px]">
                <Face number={workshop.host.face} size={64} title="" className="flex-none" />
                <p className="m-0 text-pretty">{workshop.host.text}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
