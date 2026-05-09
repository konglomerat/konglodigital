import Tile from "./Tile";

export type FaqItem = { q: string; a: string };

export default function FaqTile({ faqs }: { faqs: FaqItem[] }) {
  return (
    <Tile title="FAQ">
      {faqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine FAQs hinterlegt.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {faqs.map((item) => (
            <li key={item.q}>
              <details className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-foreground transition hover:text-primary">
                  <span className="flex-1">{item.q}</span>
                  <span
                    aria-hidden
                    className="text-muted-foreground transition group-open:rotate-90"
                  >
                    ›
                  </span>
                </summary>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
