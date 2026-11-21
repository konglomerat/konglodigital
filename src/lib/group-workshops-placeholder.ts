// Platzhalter-Inhalte für die Workshops für Gruppen, bis sie aus dem CMS
// kommen. Der Aufbau entspricht GroupWorkshop in group-workshops.ts.
//
// Auch die Fotos sind nur Beispiele: Sie liegen in
// public/workshops/gruppen-platzhalter/ und werden durch die Bilder aus dem
// CMS ersetzt. Ordner und Datei danach löschen.
import type { GroupWorkshop } from "./group-workshops";

const LOCATION = "Konglomerat";

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
    price: "ab 15 € pro Person",
    groupSize: { min: 8, max: 16 },
    terrazzo: "knglmrt-terrazzo-grob-rosa",
    images: [
      { src: "/workshops/gruppen-platzhalter/platzhalter-blinkender-anstecker-1.webp", alt: "Ein Kind schneidet Bauteilbeinchen an einer bestückten Platine ab" },
      { src: "/workshops/gruppen-platzhalter/platzhalter-blinkender-anstecker-2.webp", alt: "Nahaufnahme: Eine Platine wird gelötet, daneben der Bauplan" },
    ],
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
    price: "ab 20 € pro Person",
    groupSize: { min: 8, max: 14 },
    terrazzo: "knglmrt-terrazzo-hellgelb",
    images: [
      { src: "/workshops/gruppen-platzhalter/platzhalter-vogelhaus-bauen-1.webp", alt: "Mehrere Gruppen arbeiten gleichzeitig in der Holzwerkstatt" },
      { src: "/workshops/gruppen-platzhalter/platzhalter-vogelhaus-bauen-2.webp", alt: "Bohren an der Bohrständer-Werkbank im Freien" },
    ],
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
    price: "ab 15 € pro Person",
    groupSize: { min: 6, max: 12 },
    terrazzo: "knglmrt-terrazzo-grob-blau",
    images: [
      { src: "/workshops/gruppen-platzhalter/platzhalter-schluesselanhaenger-gestalten-1.webp", alt: "Materialien und kleine Zuschnitte auf dem Werktisch" },
    ],
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
    area: "siebdruck",
    title: "Beutel bedrucken",
    summary:
      "Motiv entwerfen, auf Stoff bringen, mitnehmen. Gut für Vereine und Jugendgruppen.",
    intro:
      "Motiv entwerfen, auf Stoff bringen, mitnehmen: Wir drucken Stoffbeutel im Siebdruck. Gut für Vereine und Jugendgruppen, die ein gemeinsames Motiv oder lauter eigene wollen.",
    audience: "ab 10 Jahren",
    duration: "3 h",
    location: LOCATION,
    price: "ab 12 € pro Person",
    groupSize: { min: 8, max: 20 },
    terrazzo: "knglmrt-terrazzo-grob-grau",
    images: [
      { src: "/workshops/gruppen-platzhalter/platzhalter-beutel-bedrucken-1.webp", alt: "Gruppe an der Siebdruckmaschine mit frisch gedrucktem Shirt" },
      { src: "/workshops/gruppen-platzhalter/platzhalter-beutel-bedrucken-2.webp", alt: "Ein bedruckter Beutel wird mit dem Heißluftfön getrocknet" },
      { src: "/workshops/gruppen-platzhalter/platzhalter-beutel-bedrucken-3.webp", alt: "Ein Cyanotypie-Druck wird im Wasserbad entwickelt" },
    ],
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
    slug: "kissenhuelle-naehen",
    area: "textil",
    title: "Kissenhülle nähen",
    summary:
      "Stoff aussuchen, zuschneiden, an der Nähmaschine nähen. Der Einstieg ins Nähen für Gruppen.",
    intro:
      "Stoff aussuchen, zuschneiden, an der Nähmaschine nähen: Jede:r näht eine eigene Kissenhülle mit Hotelverschluss und nimmt sie mit. Ein entspannter Einstieg ins Nähen – passend für Schulklassen, Jugendgruppen und Teams.",
    audience: "ab 10 Jahren",
    duration: "3 h",
    location: LOCATION,
    price: "ab 18 € pro Person",
    groupSize: { min: 6, max: 10 },
    terrazzo: "knglmrt-terrazzo-grob-rosa",
    images: [
      { src: "/workshops/gruppen-platzhalter/platzhalter-kissenhuelle-naehen-1.webp", alt: "Nähen an der Nähmaschine in der Textilwerkstatt" },
    ],
    schedule: [
      {
        time: "0:00",
        title: "Ankommen & Nähmaschine kennenlernen",
        text: "Einfädeln, Spule wechseln, ein paar gerade Nähte auf Probestoff.",
      },
      {
        time: "0:30",
        title: "Stoff aussuchen & zuschneiden",
        text: "Aus unserer Stoffkiste wählen, Maße übertragen und mit Schere oder Rollschneider zuschneiden.",
      },
      {
        time: "1:15",
        title: "Nähen",
        text: "Säume umbügeln, Hotelverschluss legen, rundherum nähen. Wir gehen von Platz zu Platz und helfen.",
      },
      {
        time: "2:30",
        title: "Wenden & Abschluss",
        text: "Ecken ausformen, bügeln, Kissen rein – und ein Gruppenfoto mit allen Ergebnissen.",
      },
    ],
    scheduleNote: "So kann es aussehen – den genauen Ablauf stimmen wir mit euch ab.",
    infos: [
      { label: "Material", text: "Stoff, Garn und Kisseninlett sind im Preis enthalten." },
      { label: "Vorkenntnisse", text: "Keine. Wer schon nähen kann, probiert einen Reißverschluss." },
      { label: "Mitbringen", text: "Gern einen Lieblingsstoff oder ein altes Hemd zum Umnähen." },
      { label: "Barrierefreiheit", text: "Textilwerkstatt im Erdgeschoss, stufenlos erreichbar." },
    ],
  },
];
