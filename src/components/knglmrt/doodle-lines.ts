// Die gezeichneten Linien des DS ("Lines_01" … "Lines_06").
//
// Die Pfaddaten liegen NICHT im Bundle: zusammen sind das ~110 KB (47 KB gzip),
// und der Divider steckt in der Top-Nav, also auf jeder Seite. Stattdessen
// liegen die SVGs unter public/branding/lines/ und werden per CSS-Maske
// eingefärbt — dadurch bleibt currentColor/var(--…) als Farbe möglich,
// die Datei wird vom Browser gecacht und kostet 0 KB JS.
//
// Quelle der SVGs: knglmrt Design System, Illustration/Lines.

export type Doodle = { viewBox: string; body: string };

export type DoodleLineNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type DoodleLine = {
  /** Pfad zur SVG-Datei in public/ */
  src: string;
  /** Intrinsische Größe des Strichs — bestimmt die Default-Höhe. */
  width: number;
  height: number;
  /** Kurzbeschreibung für den Styleguide. */
  description: string;
};

export const DOODLE_LINES: Record<DoodleLineNumber, DoodleLine> = {
  1: {
    src: "/branding/lines/Lines_01.svg",
    width: 1000,
    height: 20,
    description: "Spiralen/Schlaufen, dicht gewickelt — der lauteste Strich.",
  },
  2: {
    src: "/branding/lines/Lines_02.svg",
    width: 1000,
    height: 20,
    description: "Gleichmäßige, weiche Wellenlinie.",
  },
  3: {
    src: "/branding/lines/Lines_03.svg",
    width: 1000,
    height: 20,
    description: "Enges, unruhiges Zickzack.",
  },
  4: {
    src: "/branding/lines/Lines_04.svg",
    width: 1000,
    height: 20,
    description: "Einzelner, leicht schwankender Strich — der ruhigste (Default).",
  },
  5: {
    src: "/branding/lines/Lines_05.svg",
    width: 1000,
    height: 20,
    description: "Feine Punktreihe — gepunktet.",
  },
  6: {
    src: "/branding/lines/Lines_06.svg",
    width: 1000,
    height: 20,
    description: "Reihe kurzer, breiter Striche — gestrichelt.",
  },
};

export const DOODLE_LINE_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export function isDoodleLineNumber(value: number): value is DoodleLineNumber {
  return value >= 1 && value <= 6 && Number.isInteger(value);
}

/** CSS-Custom-Properties für die .knglmrt-line-Utility (siehe knglmrt-theme.css). */
export function doodleLineVars(
  number: DoodleLineNumber,
): Record<string, string> {
  return { "--knglmrt-line": `url("${DOODLE_LINES[number].src}")` };
}
