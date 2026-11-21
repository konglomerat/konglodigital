// Eckdaten unter dem Titel: Für, Dauer, Gruppe, Ort, Kosten.
import { getServerI18n } from "@/i18n/server";
import { formatGroupSize, type GroupWorkshop } from "@/lib/group-workshops";

export default async function GroupWorkshopFacts({
  workshop,
}: {
  workshop: GroupWorkshop;
}) {
  const { tx } = await getServerI18n();
  const facts = [
    { label: tx("Für", "de"), value: workshop.audience },
    { label: tx("Dauer", "de"), value: workshop.duration },
    {
      label: tx("Gruppe", "de"),
      value: formatGroupSize(workshop.groupSize).replace("Pers.", tx("Pers.", "de")),
    },
    { label: tx("Ort", "de"), value: workshop.location },
    { label: tx("Kosten", "de"), value: workshop.price },
  ];

  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-6 gap-y-4 border-t border-t-foreground border-b-[0.5px] border-b-[var(--knglmrt-dark-30)] py-4">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="knglmrt-label text-muted-foreground">{fact.label}</dt>
          <dd className="knglmrt-num m-0 mt-1 font-bold">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
