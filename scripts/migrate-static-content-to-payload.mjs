/**
 * Imports the editorial parts of the public website into an existing Payload
 * project. Run through the Payload CLI so its TypeScript config and env file
 * are loaded correctly:
 *
 *   cd /path/to/payload-project
 *   pnpm payload run /path/to/this/script.mjs
 *   pnpm payload run /path/to/this/script.mjs write
 *   pnpm payload run /path/to/this/script.mjs write publish
 *
 * The default is a read-only preview. `write` creates missing pages only;
 * existing documents are deliberately never updated. Without `publish`, new
 * pages are created as drafts for review in the block editor.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const backendRoot = path.resolve(
  process.env.PAYLOAD_PROJECT_DIR || process.cwd(),
);
const write = process.argv.includes("write");
const publish = process.argv.includes("publish");

const requireFromBackend = createRequire(path.join(backendRoot, "package.json"));
const payloadEntry = requireFromBackend.resolve("payload");
const { getPayload } = await import(pathToFileURL(payloadEntry).href);
const configModule = await import(
  pathToFileURL(path.join(backendRoot, "src/payload.config.ts")).href
);
const payload = await getPayload({ config: configModule.default });

const text = (value, format = 0) => ({
  type: "text",
  detail: 0,
  format,
  mode: "normal",
  style: "",
  text: value,
  version: 1,
});

const paragraph = (...children) => ({
  type: "paragraph",
  children: children.map((child) =>
    typeof child === "string" ? text(child) : child,
  ),
  direction: "ltr",
  format: "",
  indent: 0,
  textFormat: 0,
  version: 1,
});

const heading = (tag, value) => ({
  type: "heading",
  children: [text(value)],
  direction: "ltr",
  format: "",
  indent: 0,
  tag,
  version: 1,
});

const richText = (...children) => ({
  root: {
    type: "root",
    children,
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
  },
});

const link = (label, url, appearance = "default") => ({
  link: {
    type: "custom",
    appearance,
    label,
    newTab: /^https?:\/\//.test(url),
    url,
  },
});

const column = (size, ...children) => ({
  size,
  enableLink: false,
  richText: richText(...children),
});

const linkedColumn = (size, label, url, ...children) => ({
  ...column(size, ...children),
  enableLink: true,
  link: link(label, url).link,
});

const content = (blockName, ...columns) => ({
  blockName,
  blockType: "content",
  columns,
});

const cta = (blockName, nodes, ...links) => ({
  blockName,
  blockType: "cta",
  richText: richText(...nodes),
  links,
});

const pageDefinitions = [
  {
    title: "Startseite",
    slug: "startseite",
    meta: {
      title: "Konglomerat e.V.",
      description:
        "Werkstatt, Self-Service und Verwaltung des Konglomerat e.V.",
    },
    hero: {
      type: "lowImpact",
      richText: richText(
        heading("h1", "Konglomerat e.V."),
        paragraph(
          "Hier findest du alles zur Werkstatt, Self-Service und Verwaltung.",
        ),
      ),
      links: [
        link("Werkbereiche ansehen", "/werkbereiche"),
        link("Über uns", "/verein", "outline"),
      ],
    },
    layout: [
      content(
        "Mitglied werden",
        column(
          "full",
          heading("h2", "Neu hier? So wirst du Mitglied"),
        ),
        column(
          "oneThird",
          heading("h3", "1. Kennenlernen"),
          paragraph(
            "Komm zum offenen Abend, schau dich um und sprich mit uns.",
          ),
        ),
        linkedColumn(
          "oneThird",
          "Online Antrag",
          "/mitglied-werden",
          heading("h3", "2. Antrag stellen"),
          paragraph(
            "Mitgliedsantrag ausfüllen, der Vorstand bestätigt die Aufnahme.",
          ),
        ),
        column(
          "oneThird",
          heading("h3", "3. Einweisung erhalten"),
          paragraph(
            "Sicherheitseinweisung an den Maschinen, danach hast du Zugang.",
          ),
        ),
      ),
      cta(
        "Ehrenamt",
        [
          heading("h2", "Mit Herz im Ehrenamt entwickelt"),
          paragraph("Mehr über das Konglomerat und seine Arbeit erfahren."),
        ],
        link("konglomerat.org", "https://konglomerat.org"),
      ),
    ],
  },
  {
    title: "Konglomerat e.V.",
    slug: "verein",
    meta: {
      title: "Konglomerat e.V.",
      description: "Die gemeinsame Lust am Selbermachen",
    },
    hero: {
      type: "lowImpact",
      richText: richText(
        heading("h1", "Konglomerat e.V."),
        paragraph("Die gemeinsame Lust am Selbermachen"),
      ),
      links: [],
    },
    layout: [
      content(
        "Über uns",
        column(
          "full",
          heading("h2", "Über uns"),
          paragraph(
            "Im gemeinsamen Selbermachen sieht das Konglomerat großes Potential, die Geschicke der Welt in die eigenen Hände zu nehmen. Von dieser Intention angetrieben fördert der Verein auf vielfältige Weise eine Kultur der Marke Eigenbau.",
          ),
          paragraph(
            "Zweck des Vereins ist es, handwerkliche, kulturelle, künstlerische und soziale Projekte aus der Zivilgesellschaft organisatorisch und technisch zu unterstützen. Dazu kommen eigene Kooperationsprojekte in Stadtentwicklung, Community Building, nachhaltigem Wirtschaften und Umweltbildung sowie Beratung beim Aufbau von Gemeinschaftswerkstätten aller Art.",
          ),
          paragraph(
            "Unsere gemeinsame Vision ist eine kooperative Gesellschaft, in der selbstverursachte Probleme nicht auf entfernte Länder oder zukünftige Generationen abgewälzt, sondern lokal und transdisziplinär gelöst werden.",
          ),
        ),
      ),
      content(
        "Wichtige Dokumente",
        linkedColumn(
          "oneThird",
          "Vereinssatzung",
          "https://konglomerat.org",
          heading("h3", "Vereinssatzung"),
        ),
        linkedColumn(
          "oneThird",
          "Beitragsordnung",
          "https://konglomerat.org",
          heading("h3", "Beitragsordnung"),
        ),
        linkedColumn(
          "oneThird",
          "Merkblatt Datenschutz",
          "https://konglomerat.org",
          heading("h3", "Datenschutz"),
        ),
      ),
      cta(
        "Freunde und Förderer",
        [
          heading("h2", "Freunde & Förderer"),
          paragraph(
            "Als Fördermitglied nutzt du die Werkstätten und Maschinen zu Mitgliedstarifen und bestimmst mit, welche Themen und Workshops wir gemeinsam angehen.",
          ),
        ],
        link("Fördermitglied werden", "/register"),
        link("Mehr erfahren", "https://konglomerat.org", "outline"),
      ),
      content(
        "Das Rosenwerk",
        column(
          "twoThirds",
          heading("h2", "Das #Rosenwerk"),
          heading("h3", "Die Dresdner Selbstmachzentrale auf 800 m²"),
          paragraph(
            "Das #Rosenwerk liegt in einem rund 8.000 m² großen Industriekomplex nahe der Innenstadt. Seit dem 01.01.2015 mietet der Verein hier rund 800 m² Räume und Freiflächen und baut sie zur Produktionsbasis für private und gesellschaftliche Projekte aus.",
          ),
          paragraph(
            "Die offene Werkstatt im Zentrum stellt Geräte und Verfahren bereit, die über die Möglichkeiten des Einzelnen hinausgehen – nutzbar von der Nachbarschaft bis zum produzierenden Gewerbe.",
          ),
        ),
        column(
          "oneThird",
          heading("h3", "Praxis für nachhaltige Entwicklung"),
          paragraph(
            "Offene Werkstätten setzen der Ohnmacht des Konsumenten das Selbstwirksamkeitsprinzip entgegen: Dinge selbst gestalten, reparieren, verstehen und buchstäblich begreifen.",
          ),
          paragraph("Mitglied im Verbund offener Werkstätten e.V."),
        ),
      ),
    ],
  },
  {
    title: "Werkbereiche",
    slug: "werkbereiche",
    meta: {
      title: "Werkbereiche",
      description: "Werkbereiche und Projekte des Konglomerat e.V.",
    },
    hero: {
      type: "lowImpact",
      richText: richText(
        heading("h1", "Werkbereiche"),
        paragraph(
          "Entdecke die offenen Werkstätten, Maschinen und Projekte im Rosenwerk.",
        ),
      ),
      links: [],
    },
    layout: [
      content(
        "Einleitung",
        column(
          "full",
          heading("h2", "Von High Tech bis Low Tech"),
          paragraph(
            "In unseren Werkbereichen kannst du lernen, ausprobieren, reparieren und eigene Vorhaben umsetzen. Die Übersicht darunter führt dich zu allen Bereichen und Vereinsprojekten.",
          ),
        ),
      ),
    ],
  },
  {
    title: "Monatsbeitrag und Zugangskarte",
    slug: "monatsbeitrag",
    meta: {
      title: "Monatsbeitrag und Zugangskarte",
      description: "Zugangskarte auswählen und Monatsbeitrag verwalten.",
    },
    // Auf dieser Route steht der interaktive Selektor vor den CMS-Blöcken.
    hero: { type: "none" },
    layout: [
      content(
        "Hinweise zur Zugangskarte",
        column(
          "half",
          heading("h2", "Welche Karte passt zu mir?"),
          paragraph(
            "Die Abokarte eignet sich für die regelmäßige Nutzung. Für gelegentliche Besuche kannst du eine 10er Karte als Einmalzahlung in den Warenkorb legen.",
          ),
        ),
        column(
          "half",
          heading("h2", "Änderungen"),
          paragraph(
            "Deine Auswahl wird dir vor dem Speichern noch einmal angezeigt. Erläuterungen zu Preisen, Laufzeiten oder Abrechnung kannst du hier im Block-Editor aktuell halten.",
          ),
        ),
      ),
    ],
  },
];

const slugs = pageDefinitions.map(({ slug }) => slug);
const existing = await payload.find({
  collection: "pages",
  depth: 0,
  limit: slugs.length,
  pagination: false,
  overrideAccess: true,
  where: { slug: { in: slugs } },
});
const existingSlugs = new Set(existing.docs.map(({ slug }) => slug));
const missing = pageDefinitions.filter(({ slug }) => !existingSlugs.has(slug));

console.log(
  JSON.stringify(
    {
      mode: write ? (publish ? "create-published" : "create-drafts") : "preview",
      existing: slugs.filter((slug) => existingSlugs.has(slug)),
      missing: missing.map(({ slug }) => slug),
    },
    null,
    2,
  ),
);

if (write) {
  for (const definition of missing) {
    const page = await payload.create({
      collection: "pages",
      context: { disableRevalidate: true },
      depth: 0,
      draft: !publish,
      overrideAccess: true,
      data: {
        ...definition,
        _status: publish ? "published" : "draft",
      },
    });
    console.log(`created ${page.slug} (${page._status})`);
  }
}

if (payload.db.destroy) await payload.db.destroy();
