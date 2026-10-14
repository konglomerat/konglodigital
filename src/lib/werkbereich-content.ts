import type { PayloadBlock } from "./payload-cms";
import type { Werkbereich } from "./werkbereiche";

const richText = (text: string, heading = false) => ({
  root: { type: "root", version: 1, direction: "ltr", format: "", indent: 0,
    children: [{ type: heading ? "heading" : "paragraph", ...(heading ? { tag: "h2" } : {}),
      version: 1, direction: "ltr", format: "", indent: 0,
      children: [{ type: "text", text, version: 1, format: 0, detail: 0, mode: "normal", style: "" }],
    }],
  },
});

/** The same blocks power the local fallback and the initial CMS draft. */
export function werkbereichDefaultBlocks(slug: string): PayloadBlock[] {
  const blocks: PayloadBlock[] = [];
  if (slug === "3d-druck") {
    blocks.push({
      blockType: "cardGrid", blockName: "3D-Druck Self-Service", columnCount: "3",
      introContent: richText("Self-Service", true),
      cards: [
        ["Druckerstatus", "/printers", "Live-Status der Drucker, laufende Jobs und Druckzeiten."],
        ["Drucker entleeren", "/printers/emptying", "Fertige Drucke abräumen und die Entleerung bestätigen."],
        ["Drucker Zugang", "/printers/access-codes", "Zugangscodes für angemeldete Mitglieder."],
      ].map(([title, url, description]) => ({
        title, description: richText(description), enableLink: true,
        link: { type: "custom", url, label: title, appearance: "default" },
      })),
    });
  }
  blocks.push({
    blockType: "cta", blockName: "Zugang und Mitgliedschaft",
    richText: richText("Du möchtest den Werkbereich nutzen? Hier findest du Informationen zu Mitgliedschaft und Zugangskarten."),
    links: [{ link: { type: "custom", url: "/monatsbeitrag", label: "Zugang & Mitgliedschaft", appearance: "default" } }],
  });
  return blocks;
}

export function createWerkbereichDraft(area: Werkbereich) {
  return {
    title: area.name, slug: `werkbereich-${area.slug}`, werkbereich: area.slug,
    _status: "draft" as const, hero: { type: "none" as const },
    meta: { title: area.name, description: area.description },
    layout: [
      { blockType: "workshopInfo", blockName: "Steckbrief ergänzen", heading: "Auf einen Blick" },
      ...werkbereichDefaultBlocks(area.slug),
    ],
  };
}
