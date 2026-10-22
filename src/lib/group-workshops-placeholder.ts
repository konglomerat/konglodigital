// Platzhalter-Inhalte für die Workshops für Gruppen, bis sie aus dem CMS
// kommen. Der Aufbau entspricht GroupWorkshop in group-workshops.ts.
import type { GroupWorkshop } from "./group-workshops";

const LOCATION = "Konglomerat";

const photos = (...captions: string[]) =>
  captions.map((alt) => ({ src: null, alt }));

export const GROUP_WORKSHOP_PLACEHOLDERS: GroupWorkshop[] = [
  {
    slug: "blinkender-anstecker",
    area: "elektronik",
    title: "Blinkender Anstecker",
    summary:
      "Jede:r lötet eine kleine Platine mit LEDs und nimmt sie mit. Der Klassiker für Schulklassen.",
    intro:
      "Jede:r lötet eine kleine Platine mit LEDs und nimmt sie als Anstecker mit nach Hause. Der Klassiker für Schulklassen: Nach drei Stunden haben alle etwas in der Hand, das leuchtet – und eine Ahnung, wie Elektronik funktioniert.",
    audience: "ab Klasse 5",
    duration: "3 h",
    location: LOCATION,
    price: "ab 15 € p. P.",
    groupSize: { min: 8, max: 16 },
    terrazzo: "knglmrt-terrazzo-grob-rosa",
    images: photos(
      "Foto: Schulklasse am Löttisch",
      "Foto: Nahaufnahme Lötpunkt",
      "Foto: fertige Anstecker",
    ),
    schedule: [
      {
        time: "0:00",
        title: "Ankommen & Sicherheit",
        text: "Rundgang durch die Elektronikwerkstatt, Schutzbrillen auf, Regeln am Lötplatz.",
      },
      {
        time: "0:20",
        title: "Wie funktioniert eine LED?",
        text: "Strom, Widerstand, Polung – kurz erklärt am Steckbrett, ohne Formeln.",
      },
      {
        time: "0:45",
        title: "Löten",
        text: "Jede:r bestückt die eigene Platine. Wir gehen von Platz zu Platz und helfen.",
      },
      {
        time: "2:30",
        title: "Testen & Anstecken",
        text: "Batterie rein, es blinkt. Wer früher fertig ist, gestaltet die Rückseite.",
      },
    ],
    scheduleNote: "So kann es aussehen – den genauen Ablauf stimmen wir mit euch ab.",
    infos: [
      { label: "Material", text: "Platine, Bauteile und Batterie sind im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine. Feinmotorik ab etwa 10 Jahren reicht völlig." },
      { label: "Mitbringen", text: "Nichts. Lange Haare bitte zusammenbinden." },
      {
        label: "Barrierefreiheit",
        text: "Elektronikwerkstatt im Erdgeschoss, stufenlos erreichbar.",
      },
      {
        label: "Bei euch vor Ort",
        text: "Auf Anfrage möglich – wir bringen Lötstationen mit.",
      },
    ],
    host: {
      text: "Geleitet von Malte und einer zweiten Person aus dem Elektronik-Bereich – bei mehr als 12 Teilnehmenden zu dritt.",
      face: 12,
    },
  },
  {
    slug: "vogelhaus-bauen",
    area: "holz",
    title: "Vogelhaus bauen",
    summary:
      "Messen, sägen, schrauben. Ideal als Projekttag – das Ergebnis hängt danach im Schulgarten.",
    intro:
      "Messen, sägen, schrauben: Jede Kleingruppe baut ein Vogelhaus aus Vollholz. Ideal als Projekttag – das Ergebnis hängt danach im Schulgarten oder auf dem Vereinsgelände.",
    audience: "ab Klasse 3",
    duration: "4 h",
    location: LOCATION,
    price: "ab 20 € p. P.",
    groupSize: { min: 8, max: 14 },
    terrazzo: "knglmrt-terrazzo-hellgelb",
    images: photos(
      "Foto: Vogelhäuser auf der Werkbank",
      "Foto: Kinder beim Sägen",
      "Foto: fertiges Vogelhaus",
    ),
    schedule: [
      {
        time: "0:00",
        title: "Ankommen & Werkstattregeln",
        text: "Rundgang durch die Holzwerkstatt und die wichtigsten Regeln für den Umgang mit Werkzeug.",
      },
      {
        time: "0:30",
        title: "Zuschnitt",
        text: "Messen, anzeichnen und sägen – in Teams, mit Hilfe von uns.",
      },
      {
        time: "1:30",
        title: "Zusammenbau",
        text: "Schrauben, leimen, nachschleifen. Jedes Haus bekommt seinen eigenen Charakter.",
      },
      {
        time: "3:15",
        title: "Fertigstellen & Abschluss",
        text: "Dach drauf, Aufhängung dran, Gruppenfoto.",
      },
    ],
    infos: [
      { label: "Material", text: "Holz, Schrauben und Leim sind im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine." },
      { label: "Mitbringen", text: "Feste Schuhe und Kleidung, die dreckig werden darf." },
      { label: "Barrierefreiheit", text: "Holzwerkstatt im Erdgeschoss, stufenlos erreichbar." },
    ],
  },
  {
    slug: "schluesselanhaenger-gestalten",
    area: "laser",
    title: "Schlüsselanhänger gestalten",
    summary:
      "Am Rechner zeichnen, am Laser schneiden. Zeigt in kurzer Zeit, wie digitale Fertigung funktioniert.",
    intro:
      "Am Rechner zeichnen, am Laser schneiden: Jede:r entwirft einen eigenen Schlüsselanhänger und sieht live, wie aus einer Datei ein Gegenstand wird. Ein kurzer Einstieg in digitale Fertigung.",
    audience: "ab 12 Jahren",
    duration: "2,5 h",
    location: LOCATION,
    price: "ab 15 € p. P.",
    groupSize: { min: 6, max: 12 },
    terrazzo: "knglmrt-terrazzo-grob-blau",
    images: photos(
      "Foto: gelaserte Anhänger",
      "Foto: Lasercutter im Betrieb",
      "Foto: Entwurf am Bildschirm",
    ),
    schedule: [
      {
        time: "0:00",
        title: "Ankommen & Sicherheit",
        text: "Wie der Lasercutter funktioniert und worauf wir achten.",
      },
      {
        time: "0:20",
        title: "Entwerfen",
        text: "Form und Schriftzug am Rechner zeichnen, wir helfen bei der Datei.",
      },
      {
        time: "1:15",
        title: "Schneiden",
        text: "Die Entwürfe werden nacheinander gelasert – zuschauen ausdrücklich erlaubt.",
      },
    ],
    infos: [
      { label: "Material", text: "Holz und Schlüsselringe sind im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine." },
      { label: "Mitbringen", text: "Nichts." },
    ],
  },
  {
    slug: "beutel-bedrucken",
    area: "textil",
    title: "Beutel bedrucken",
    summary:
      "Motiv entwerfen, auf Stoff bringen, mitnehmen. Gut für Vereine und Jugendgruppen.",
    intro:
      "Motiv entwerfen, auf Stoff bringen, mitnehmen: Wir drucken Stoffbeutel im Siebdruck. Gut für Vereine und Jugendgruppen, die ein gemeinsames Motiv oder lauter eigene wollen.",
    audience: "ab 10 Jahren",
    duration: "3 h",
    location: LOCATION,
    price: "ab 12 € p. P.",
    groupSize: { min: 8, max: 20 },
    terrazzo: "knglmrt-terrazzo-grob-grau",
    images: photos(
      "Foto: bedruckte Stoffbeutel",
      "Foto: Siebdruck in Aktion",
      "Foto: Motive zum Trocknen",
    ),
    schedule: [
      {
        time: "0:00",
        title: "Ankommen & Einführung",
        text: "Kurze Einführung in den Siebdruck.",
      },
      {
        time: "0:30",
        title: "Motiv entwerfen",
        text: "Zeichnen, schneiden oder eine eigene Vorlage mitbringen.",
      },
      {
        time: "1:30",
        title: "Drucken",
        text: "Jede:r druckt den eigenen Beutel, der Rest trocknet bis zum Ende.",
      },
    ],
    infos: [
      { label: "Material", text: "Beutel und Farben sind im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine." },
      { label: "Mitbringen", text: "Kleidung, die Farbe abbekommen darf." },
    ],
  },
  {
    slug: "erste-schritte-3d-druck",
    area: "3d-druck",
    title: "Erste Schritte im 3D-Druck",
    summary:
      "Einfache Formen modellieren und ausdrucken. Ein Einstieg in CAD für Oberstufe und Ausbildung.",
    intro:
      "Einfache Formen modellieren und ausdrucken: In zwei Terminen führen wir in CAD und 3D-Druck ein. Passend für die Oberstufe, Ausbildungsgruppen und AGs.",
    audience: "ab Klasse 8",
    duration: "2 × 3 h",
    location: LOCATION,
    price: "ab 25 € p. P.",
    groupSize: { min: 6, max: 12 },
    terrazzo: "knglmrt-terrazzo-grob-rosa",
    images: photos(
      "Foto: 3D-Drucker in Aktion",
      "Foto: Modell am Bildschirm",
      "Foto: gedruckte Teile",
    ),
    schedule: [
      {
        time: "Tag 1",
        title: "Modellieren",
        text: "Grundformen am Rechner kombinieren, Maße und Toleranzen verstehen.",
      },
      {
        time: "Tag 2",
        title: "Drucken & Nacharbeiten",
        text: "Slicen, drucken, Stützen entfernen und das fertige Teil mitnehmen.",
      },
    ],
    scheduleNote: "Die beiden Termine liegen idealerweise im Abstand von einer Woche.",
    infos: [
      { label: "Material", text: "Filament ist im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine, Laptops stellen wir." },
      { label: "Mitbringen", text: "Nichts." },
    ],
  },
];
