// Redaktionelle Inhalte der Workshop-Seite, übernommen aus dem Entwurf
// „Events Export“. Die Termine selbst kommen live aus Campai, die Workshops
// für Gruppen aus src/lib/group-workshops.ts.

export const ORG_TYPES = [
  { value: "schule", label: "Schule", org: "Schule", audience: "Klassenstufe" },
  { value: "verein", label: "Verein", org: "Verein", audience: "Alter der Teilnehmenden" },
  { value: "firma", label: "Firma", org: "Firma", audience: "Vorkenntnisse" },
  {
    value: "andere",
    label: "Andere",
    org: "Gruppe / Organisation",
    audience: "Alter der Teilnehmenden",
  },
] as const;

export type OrgType = (typeof ORG_TYPES)[number]["value"];

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Brauche ich Vorkenntnisse?",
    a: "Nein. Die Grundkurse sind für Leute gedacht, die noch nie an der Maschine standen. Wenn ein Kurs etwas voraussetzt, steht es in der Beschreibung.",
  },
  {
    q: "Muss ich Mitglied sein, um einen Kurs zu buchen?",
    a: "Nein, unsere Kurse sind offen für alle. Mitglieder zahlen bei manchen Kursen weniger – melde dich dafür vor der Buchung an, dann siehst du den Mitgliedertarif.",
  },
  {
    q: "Was ist im Preis enthalten?",
    a: "Anleitung, Maschinennutzung und das Material für das Kursprojekt. Was du baust, nimmst du mit.",
  },
  {
    q: "Was soll ich mitbringen?",
    a: "Feste Schuhe und Kleidung, die dreckig werden darf. Lange Haare bitte zusammenbinden. Schutzausrüstung haben wir da.",
  },
  {
    q: "Kann ich stornieren?",
    a: "Ja. Die Stornobedingungen stehen bei jedem Termin auf der Buchungsseite. Absagen kannst du über den Link in deiner Bestätigungsmail – oder du gibst deinen Platz an jemand anderen weiter.",
  },
  {
    q: "Was passiert, wenn ein Kurs ausgebucht ist?",
    a: "Dann trägst du dich auf die Warteliste ein. Wird ein Platz frei, bekommst du eine Mail und kannst ihn für eine begrenzte Zeit annehmen.",
  },
  {
    q: "Gibt es Workshops für Schulklassen und Vereine?",
    a: "Ja – siehe „Workshops anfragen“ weiter oben. Wir passen Inhalt, Dauer und Termin an eure Gruppe an. Schulen und gemeinnützige Vereine bekommen einen ermäßigten Satz.",
  },
  {
    q: "Ist das Konglomerat barrierefrei?",
    a: "Nicht überall. Schreib uns vorher, dann klären wir, welcher Kurs für dich passt und wie wir ihn einrichten.",
  },
];
