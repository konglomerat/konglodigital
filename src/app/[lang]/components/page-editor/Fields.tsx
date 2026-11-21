"use client";

/* CMS thumbnail URLs are already resized and may use different storage hosts. */
/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
const LexicalInput = dynamic(() => import("./LexicalInput"), {
  ssr: false,
  loading: () => <p>Texteditor wird geladen …</p>,
});
export type Json = Record<string, unknown>;
export type Choice = { id: string | number; label: string; url?: string };
export type Library = { media: Choice[]; pages: Choice[] };
const labels: Record<string, string> = {
  title: "Titel",
  heading: "Überschrift",
  description: "Beschreibung",
  richText: "Text",
  introContent: "Einleitung",
  content: "Text",
  columns: "Textspalten",
  items: "Einträge",
  cards: "Karten",
  links: "Links",
  link: "Link",
  label: "Beschriftung",
  url: "Adresse",
  newTab: "In neuem Tab öffnen",
  appearance: "Darstellung",
  type: "Art",
  media: "Bild / Video",
  poster: "Video-Vorschaubild",
  width: "Breite",
  file: "Datei",
  logo: "Logo",
  address: "Adresse",
  email: "E-Mail",
  phone: "Telefon",
  mapUrl: "Inventar-Ort oder Karten-Link",
  location: "Ort",
  hours: "Öffnungszeiten",
  access: "Zugang",
  costs: "Kosten",
  tag: "Inventar-Tag",
  contentSource: "Inhalte",
  columnCount: "Einträge pro Zeile",
  slot: "App-Inhalt",
  size: "Breite",
  name: "Name",
  value: "Wert",
  hint: "Hinweis",
  tone: "Farbe",
  caption: "Bildunterschrift",
  enableLink: "Link anzeigen",
  eyebrow: "Dachzeile",
  reference: "Verlinkte Seite",
  hero: "Einstieg",
  meta: "Suchmaschinen und Vorschautext",
  image: "Vorschaubild",
  requirement: "Voraussetzung",
  kind: "Einbettung",
  aspectRatio: "Seitenverhältnis",
  enableIntro: "Einleitung anzeigen",
  limit: "Anzahl",
  populateBy: "Auswahl",
  selectedDocs: "Ausgewählte Beiträge",
  categories: "Kategorien",
  form: "Formular",
};
const options: Record<string, [string, string][]> = {
  width: [
    ["auto", "Nach Spaltenzahl"],
    ["full", "Volle Breite"],
    ["half", "Halbe Breite"],
    ["third", "Ein Drittel"],
  ],
  columnCount: [
    ["2", "2 pro Zeile"],
    ["3", "3 pro Zeile"],
    ["4", "4 pro Zeile"],
  ],
  contentSource: [
    ["inventory", "Inventargegenstände"],
    ["showcase", "Showcase-Projekte"],
  ],
  appearance: [
    ["default", "Gefüllt"],
    ["outline", "Umrandet"],
  ],
  size: [
    ["full", "Volle Breite"],
    ["half", "Halbe Breite"],
    ["oneThird", "Ein Drittel"],
    ["twoThirds", "Zwei Drittel"],
  ],
  tone: [
    ["grau", "Grau"],
    ["rosa", "Rosa"],
    ["gelb", "Gelb"],
    ["gruen", "Grün"],
  ],
  slot: [
    ["calendarUpcoming", "Passende Termine"],
    ["news", "Neuigkeiten"],
    ["showcaseOfMonth", "Projekt des Monats"],
    ["resourceOfMonth", "Inventar des Monats"],
  ],
  kind: [
    ["iframe", "Webseite"],
    ["video", "Video"],
    ["audio", "Audio"],
  ],
  aspectRatio: [
    ["16/9", "16:9"],
    ["4/3", "4:3"],
    ["1/1", "Quadratisch"],
  ],
};
const hidden = new Set([
  "id",
  "blockType",
  "blockName",
  "createdAt",
  "updatedAt",
]);
const rich = new Set(["richText", "introContent", "content"]);
const mediaKeys = new Set(["media", "image", "file", "logo", "poster"]);

export default function Fields({
  value,
  onChange,
  library,
  path = "Seite",
  settingsOnly = false,
}: {
  value: Json;
  onChange: (next: Json) => void;
  library: Library;
  path?: string;
  settingsOnly?: boolean;
}) {
  if (value.type === "reference" && !("reference" in value) && "label" in value)
    value = { ...value, reference: null };
  return (
    <div className="cms-fields">
      {Object.entries(value)
        .filter(([key]) => !hidden.has(key))
        .map(([key, field]) => {
          const label = labels[key] ?? key;
          const id = `${path}.${key}`;
          const change = (next: unknown) => onChange({ ...value, [key]: next });
          if (key === "link" && value.enableLink === false) return null;
          if (
            settingsOnly &&
            (rich.has(key) ||
              (field && typeof field === "object" && "root" in field))
          )
            return null;
          if (
            rich.has(key) ||
            (field && typeof field === "object" && "root" in field)
          )
            return (
              <div key={key}>
                <span className="cms-field-label">{label}</span>
                <LexicalInput
                  label={`${label} bearbeiten`}
                  value={field as Json | null}
                  onChange={change}
                />
              </div>
            );
          if (key === "reference") {
            const ref = field as {
              relationTo?: string;
              value?: string | number;
            } | null;
            if (value.type !== "reference") return null;
            if (ref?.relationTo && ref.relationTo !== "pages")
              return <p key={key}>Der verlinkte Beitrag bleibt unverändert.</p>;
            return (
              <label key={key}>
                {label}
                <select
                  value={String(ref?.value ?? "")}
                  onChange={(e) =>
                    change({
                      relationTo: "pages",
                      value: Number(e.target.value),
                    })
                  }
                >
                  <option value="">Seite wählen</option>
                  {library.pages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (mediaKeys.has(key))
            return (
              <label key={key}>
                {label}
                <select
                  value={String(field ?? "")}
                  onChange={(e) =>
                    change(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Kein Medium</option>
                  {library.media.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {field &&
                library.media.find((m) => String(m.id) === String(field))
                  ?.url ? (
                  <img
                    className="cms-media-preview"
                    alt="Ausgewähltes Medium"
                    src={
                      library.media.find((m) => String(m.id) === String(field))
                        ?.url
                    }
                  />
                ) : null}
              </label>
            );
          if (["form", "categories", "selectedDocs"].includes(key))
            return (
              <p key={key}>
                {label}: Diese Verknüpfung bleibt unverändert. Sie kann im CMS
                geändert werden.
              </p>
            );
          if (Array.isArray(field))
            return (
              <fieldset key={key}>
                <legend>{label}</legend>
                {field.map((entry, index) => (
                  <div
                    className="cms-array-item"
                    key={
                      typeof entry === "object" && entry?.id
                        ? String(entry.id)
                        : index
                    }
                  >
                    {entry && typeof entry === "object" ? (
                      <Fields
                        value={entry}
                        library={library}
                        settingsOnly={settingsOnly}
                        path={`${id}.${index}`}
                        onChange={(next) =>
                          change(
                            field.map((old, i) => (i === index ? next : old)),
                          )
                        }
                      />
                    ) : (
                      <input
                        aria-label={`${label} ${index + 1}`}
                        value={String(entry ?? "")}
                        onChange={(e) =>
                          change(
                            field.map((old, i) =>
                              i === index ? e.target.value : old,
                            ),
                          )
                        }
                      />
                    )}
                    <div className="cms-item-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const list = [...field];
                          [list[index - 1], list[index]] = [
                            list[index],
                            list[index - 1],
                          ];
                          change(list);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === field.length - 1}
                        onClick={() => {
                          const list = [...field];
                          [list[index + 1], list[index]] = [
                            list[index],
                            list[index + 1],
                          ];
                          change(list);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          change(field.filter((_, i) => i !== index))
                        }
                      >
                        Eintrag entfernen
                      </button>
                    </div>
                  </div>
                ))}
                {field.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const copy = JSON.parse(
                        JSON.stringify(field.at(-1)),
                        (key, value) => (key === "id" ? undefined : value),
                      );
                      change([...field, copy]);
                    }}
                  >
                    Eintrag duplizieren
                  </button>
                )}
              </fieldset>
            );
          if (field && typeof field === "object")
            return (
              <fieldset key={key}>
                <legend>{label}</legend>
                <Fields
                  value={field as Json}
                  library={library}
                  settingsOnly={settingsOnly}
                  path={id}
                  onChange={change}
                />
              </fieldset>
            );
          if (typeof field === "boolean" || key === "newTab")
            return (
              <label className="cms-checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(field)}
                  onChange={(e) => change(e.target.checked)}
                />
                {label}
              </label>
            );
          const choices =
            options[key] ??
            (key === "type"
              ? path.endsWith("hero")
                ? [
                    ["none", "Kein Einstieg"],
                    ["lowImpact", "Nur Text"],
                    ["mediumImpact", "Text und Bild"],
                    ["highImpact", "Hervorgehoben"],
                  ]
                : [
                    ["custom", "Adresse"],
                    ["reference", "Interne Seite"],
                  ]
              : null);
          if (choices)
            return (
              <label key={key}>
                {label}
                <select
                  value={String(field ?? "")}
                  onChange={(e) => change(e.target.value)}
                >
                  <option value="">Bitte wählen</option>
                  {choices.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            );
          if (key === "url" && value.type === "reference") return null;
          if (typeof field === "number")
            return (
              <label key={key}>
                {label}
                <input
                  type="number"
                  value={field}
                  onChange={(e) => change(Number(e.target.value))}
                />
              </label>
            );
          return (
            <label key={key}>
              {label}
              {[
                "description",
                "address",
                "access",
                "hours",
                "costs",
                "hint",
              ].includes(key) ? (
                <textarea
                  rows={3}
                  value={String(field ?? "")}
                  onChange={(e) => change(e.target.value)}
                />
              ) : (
                <input
                  type={key === "email" ? "email" : "text"}
                  value={String(field ?? "")}
                  onChange={(e) => change(e.target.value)}
                />
              )}
            </label>
          );
        })}
    </div>
  );
}
