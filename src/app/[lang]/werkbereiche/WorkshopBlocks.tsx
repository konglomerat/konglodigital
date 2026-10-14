import type { PayloadBlock, PayloadRecord } from "@/lib/payload-cms";

type EquipmentItem = PayloadRecord & {
  id?: string;
  name?: string | null;
  description?: string | null;
  requirement?: string | null;
};

export default function WorkshopBlock({ block }: { block: PayloadBlock }) {
  if (block.blockType === "workshopInfo") {
    const facts = [
      ["Ort", block.location],
      ["Zugang & Einweisung", block.access],
      ["Offene Werkstatt", block.hours],
      ["Kosten & Material", block.costs],
    ].filter(([, value]) => typeof value === "string" && value.trim());
    if (!facts.length) return null;
    return (
      <section className="knglmrt-border-t py-6">
        <h2 className="mb-4">{block.heading || "Auf einen Blick"}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0 knglmrt-border bg-primary-soft p-4">
              <dt className="mb-1 font-bold">{label}</dt>
              <dd className="whitespace-pre-line break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }
  if (block.blockType === "equipment") {
    const items = ((block.items ?? []) as EquipmentItem[]).filter((item) => item.name?.trim());
    if (!items.length) return null;
    return (
      <section className="knglmrt-border-t py-6">
        <h2 className="mb-4">{block.heading || "Ausstattung"}</h2>
        {block.description ? <p className="mb-4 max-w-prose">{block.description}</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.id ?? index} className="min-w-0 knglmrt-border bg-card p-4">
              <h3 className="text-xl break-words">{item.name}</h3>
              {item.description ? <p className="mt-2 whitespace-pre-line">{item.description}</p> : null}
              {item.requirement ? <p className="mt-3 text-sm text-muted-foreground"><strong>Voraussetzung:</strong> {item.requirement}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}
