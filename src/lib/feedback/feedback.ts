// Feedback-Button: alles ohne Seiteneffekte — Prüfen der Eingaben und der Text,
// der öffentlich auf GitHub landet. Die E-Mail-Adresse kommt hier bewusst nie vor.

export const FEEDBACK_TYPES = ["bug", "feature"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_NAME_MAX = 80;
export const FEEDBACK_MESSAGE_MAX = 5000;
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;
export const FEEDBACK_SCREENSHOT_MAX_EDGE = 1920;
export const FEEDBACK_DISCUSSIONS_URL =
  "https://github.com/konglomerat/konglodigital/discussions/categories/ideas";

const TITLE_MAX = 80;
const PATH_MAX = 200;
const DIMENSION_MAX = 20_000;

export type FeedbackLanguage = "de" | "en";

export type FeedbackContext = {
  path: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
  pixelRatio: number | null;
  touch: boolean;
  language: FeedbackLanguage;
};

export type FeedbackEnvironment = {
  browser: string;
  os: string;
  device: string;
};

export type FeedbackSubmission = {
  type: FeedbackType;
  name: string;
  message: string;
  title: string;
  context: FeedbackContext;
};

export type FeedbackResponse = {
  /** Der neue Eintrag auf GitHub. */
  url: string;
};

const dimension = (value: unknown) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 && number <= DIMENSION_MAX
    ? number
    : null;
};

// Nur der Pfad: Query und Hash können Tokens oder Suchbegriffe enthalten.
const sanitizePath = (value: unknown) => {
  if (typeof value !== "string") return "unbekannt";
  const path = value.split(/[?#]/, 1)[0].slice(0, PATH_MAX);
  return /^\/[\w\-./~%]*$/.test(path) ? path : "unbekannt";
};

export const parseFeedbackContext = (value: unknown): FeedbackContext => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const pixelRatio = Number(raw.pixelRatio);

  return {
    path: sanitizePath(raw.path),
    viewportWidth: dimension(raw.viewportWidth),
    viewportHeight: dimension(raw.viewportHeight),
    screenWidth: dimension(raw.screenWidth),
    screenHeight: dimension(raw.screenHeight),
    pixelRatio:
      Number.isFinite(pixelRatio) && pixelRatio > 0 && pixelRatio <= 8
        ? Math.round(pixelRatio * 100) / 100
        : null,
    touch: raw.touch === true,
    language: raw.language === "en" ? "en" : "de",
  };
};

/** Die erste Textzeile wird zum Titel des GitHub-Eintrags. */
export const deriveFeedbackTitle = (message: string) => {
  const firstLine =
    message
      .split("\n")
      .map((line) =>
        line
          .replace(/^[\s#>*\-+`]+/, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find(Boolean) ?? "";

  if (!firstLine) return "Feedback";
  if (firstLine.length <= TITLE_MAX) return firstLine;

  const cut = firstLine.slice(0, TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export const parseFeedbackSubmission = (input: {
  type: unknown;
  name: unknown;
  message: unknown;
  context: unknown;
}): FeedbackSubmission | null => {
  const type = FEEDBACK_TYPES.find((entry) => entry === input.type);
  const name =
    typeof input.name === "string"
      ? input.name.replace(/\s+/g, " ").trim()
      : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!type || !name || name.length > FEEDBACK_NAME_MAX) return null;
  if (!message || message.length > FEEDBACK_MESSAGE_MAX) return null;

  const context = parseFeedbackContext(input.context);

  return {
    type,
    name,
    message,
    title: deriveFeedbackTitle(message),
    // Ideen brauchen keinen technischen Kontext.
    context: type === "bug" ? context : parseFeedbackContext(null),
  };
};

/** Öffentlich steht nur „Mika M.“ statt des vollen Namens. */
export const formatPublicFeedbackName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const initial = parts.length > 1 ? parts.at(-1)?.match(/\p{L}/u)?.[0] : null;
  return initial
    ? `${parts[0]} ${initial.toLocaleUpperCase("de")}.`
    : parts[0];
};

const matchVersion = (userAgent: string, pattern: RegExp) =>
  userAgent.match(pattern)?.[1] ?? null;

const describeBrowser = (userAgent: string) => {
  // Reihenfolge zählt: fast alle Browser nennen auch „Chrome“ oder „Safari“.
  const browsers: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Samsung Internet", /SamsungBrowser\/(\d+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari\//],
  ];

  for (const [name, pattern] of browsers) {
    const version = matchVersion(userAgent, pattern);
    if (version) return `${name} ${version}`;
  }
  return "Unbekannt";
};

const describeOs = (userAgent: string, touch: boolean) => {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  // iPadOS meldet sich als Mac — nur der Touchscreen verrät es.
  if (/Mac OS X|Macintosh/.test(userAgent)) return touch ? "iPadOS" : "macOS";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Unbekannt";
};

const describeDevice = (userAgent: string, touch: boolean) => {
  if (/iPad|Tablet/.test(userAgent)) return "Tablet";
  if (/Macintosh/.test(userAgent) && touch) return "Tablet";
  if (/Android/.test(userAgent) && !/Mobile/.test(userAgent)) return "Tablet";
  if (/Mobi|iPhone|Android/.test(userAgent)) return "Smartphone";
  return "Desktop";
};

export const describeFeedbackEnvironment = (
  userAgent: string,
  touch: boolean,
): FeedbackEnvironment => ({
  browser: describeBrowser(userAgent),
  os: describeOs(userAgent, touch),
  device: describeDevice(userAgent, touch),
});

const formatSize = (width: number | null, height: number | null) =>
  width && height ? `${width} × ${height}` : "unbekannt";

export const feedbackContextRows = (
  context: FeedbackContext,
  environment: FeedbackEnvironment,
): Array<[label: string, value: string]> => [
  ["Seite", context.path],
  ["Gerät", environment.device],
  ["Browser", environment.browser],
  ["Betriebssystem", environment.os],
  ["Fenster", formatSize(context.viewportWidth, context.viewportHeight)],
  [
    "Bildschirm",
    `${formatSize(context.screenWidth, context.screenHeight)}${
      context.pixelRatio ? ` @${context.pixelRatio}x` : ""
    }`,
  ],
  ["Sprache", context.language],
];

// Ein Beitrag soll auf GitHub niemanden anpingen: das unsichtbare Zeichen
// bricht die Erwähnung, der Text liest sich unverändert.
export const neutralizeGithubMentions = (text: string) =>
  text.replace(/(^|[^\w`/])@(?=[a-z0-9])/gim, "$1@​");

// Der Name steht mitten im Satz und darf dort keine Formatierung auslösen.
const escapeGithubInline = (text: string) =>
  neutralizeGithubMentions(text.replace(/[\\`*_[\]<>|~#]/g, "\\$&"));

// Eingeklappt, damit der Kontext den eigentlichen Beitrag nicht verdrängt. Die
// Leerzeilen braucht GitHub, um die Tabelle in <details> als Tabelle zu zeigen.
const buildContextDetails = (
  context: FeedbackContext,
  environment: FeedbackEnvironment,
) =>
  [
    "<details>",
    "<summary>Kontext</summary>",
    "",
    "| Feld | Wert |",
    "| --- | --- |",
    ...feedbackContextRows(context, environment).map(
      ([label, value]) => `| ${label} | \`${value}\` |`,
    ),
    "",
    "</details>",
  ].join("\n");

export const buildGithubFeedbackBody = ({
  type,
  name,
  message,
  context,
  environment,
  screenshotUrl,
}: {
  type: FeedbackType;
  name: string;
  message: string;
  context: FeedbackContext;
  environment: FeedbackEnvironment;
  screenshotUrl: string | null;
}) =>
  [
    neutralizeGithubMentions(message),
    screenshotUrl ? `![Screenshot](${screenshotUrl})` : null,
    "---",
    `Gesendet von **${escapeGithubInline(formatPublicFeedbackName(name))}** über den Feedback-Button`,
    type === "bug" ? buildContextDetails(context, environment) : null,
  ]
    .filter(Boolean)
    .join("\n\n");
