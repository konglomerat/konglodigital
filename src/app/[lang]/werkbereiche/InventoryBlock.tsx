import { loadInventoryBlockItems } from "@/lib/inventory-block-server";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { buildShowcasePath } from "@/lib/showcase-path";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import type { PayloadBlock } from "@/lib/payload-cms";

const columns = { "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "sm:grid-cols-2 lg:grid-cols-4" };

export default async function InventoryBlock({ block }: { block: PayloadBlock }) {
  const isShowcase = block.contentSource === "showcase";
  const { items, unavailable } = await loadInventoryBlockItems(block.tag ?? "", isShowcase ? "showcase" : "inventory");
  const { locale } = await getServerI18n();
  return <section className="knglmrt-border-t py-6">
    <h2 className="mb-4">{block.heading || (isShowcase ? "Hier entstanden" : "Inventar")}</h2>
    {block.description && <p className="mb-5 max-w-[680px]">{block.description}</p>}
    {unavailable ? <p>{isShowcase ? "Die Projekte sind gerade nicht abrufbar." : "Das Inventar ist gerade nicht erreichbar."} Bitte versuche es später erneut.</p>
      : !items.length ? <p>{isShowcase ? "Aktuell sind keine Projekte mit diesem Tag veröffentlicht." : "Aktuell sind keine passenden Inventargegenstände eingetragen."}</p>
      : <div className={`grid gap-4 ${columns[block.columnCount ?? "3"]}`}>
        {items.map(item => <a key={item.id} href={localizePathname(isShowcase ? buildShowcasePath(item) : buildResourcePath(item), locale)}
          className="knglmrt-terrazzo-hover knglmrt-border bg-card transition hover:bg-primary-soft">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt={item.name} loading="lazy" className={`aspect-[4/3] w-full border-b border-border bg-white ${isShowcase ? "object-cover" : "object-contain"}`} />
          ) : <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted text-sm text-muted-foreground">Noch kein Foto</div>}
          <div className="p-4"><h3 className="text-lg">{item.name}</h3><span className="mt-2 block text-sm font-bold text-primary">{isShowcase ? "Projekt ansehen →" : "Im Inventar ansehen →"}</span></div>
        </a>)}
      </div>}
    {isShowcase && <a href={localizePathname("/showcase", locale)} className="mt-6 inline-block font-bold text-primary">Alle Projekte ansehen →</a>}
  </section>;
}
