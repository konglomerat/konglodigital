/**
 * Framework-agnostic Konglomerat newsletter renderer.
 *
 * This module is intentionally pure: it does not read files, access process.env,
 * fetch remote data, or generate image variants. Callers resolve showcases,
 * calendar events, and final public image URLs before calling renderNewsletter().
 */

export const NEWSLETTER_ASPECTS = [
  "original",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "4:5",
  "3:4",
] as const;

export type NewsletterAspect = (typeof NEWSLETTER_ASPECTS)[number];
export type NewsletterLayout = "split" | "stacked";

export interface NewsletterShowcase {
  id: string;
  title: string;
  description: string;
  date: string | Date;
  url: string;
  imageUrl?: string | null;
  subtitle?: string | null;
  layout?: NewsletterLayout;
  aspect?: NewsletterAspect;
  showLink?: boolean;
  linkText?: string;
}

export interface NormalizedNewsletterShowcase {
  id: string;
  title: string;
  description: string;
  date: string;
  url: string | null;
  imageUrl: string | null;
  subtitle: string;
  layout: NewsletterLayout;
  aspect: NewsletterAspect;
  showLink: boolean;
  linkText: string;
}

export interface NewsletterShowcaseItem {
  type: "showcase";
  showcaseId: string;
}

export interface NewsletterButtonItem {
  type: "button";
  title: string;
  href: string;
}

export interface NewsletterBannerItem {
  type: "banner";
  title?: string;
  content?: string;
}

export type NewsletterItem =
  | NewsletterShowcaseItem
  | NewsletterButtonItem
  | NewsletterBannerItem;

export interface NewsletterCalendarEvent {
  id?: string;
  title: string;
  start: string | Date;
  end?: string | Date;
  allDay?: boolean;
  location?: string | null;
  url?: string | null;
}

export interface NewsletterCalendar {
  events: readonly NewsletterCalendarEvent[];
  daysAhead?: number;
  timeZone?: string;
  calendarUrl?: string;
}

export interface NewsletterAssets {
  logo: string;
  divider: string;
  arrow: string;
  footer: string;
}

export interface RenderNewsletterOptions {
  showcases: readonly NewsletterShowcase[];
  items?: readonly NewsletterItem[];
  title: string;
  subject?: string;
  intro: string;
  baseUrl?: string;
  calendar?: NewsletterCalendar;
  showShowcasesHeading?: boolean;
  assets?: Partial<NewsletterAssets>;
  membershipUrl?: string;
  webviewHref?: string;
  unsubscribeHref?: string;
}

const DEFAULT_BASE_URL = "https://digital.konglomerat.org/";
const PINK = "#ff3366";
const LIGHT_PINK = "#ffe7ed";
const DARK_PINK = "#a61e4d";
const BLACK = "#111111";
const LIGHT = "#f1f1f1";

export const DEFAULT_NEWSLETTER_ASSETS: Readonly<NewsletterAssets> = {
  logo:
    "https://c.emailsys1a.net/mailingassets/3e3b536fe1150e90eef62e40133a2cddbc2cd95b.png",
  divider:
    "https://c.emailsys1a.net/mailingassets/84bf15309f807da0ec2a18a6489719a435cae4c6.png",
  arrow:
    "https://c.emailsys1a.net/mailingassets/73ec11d446ccb796aff7c8717124e2dbe143d0c6.png",
  footer:
    "https://c.emailsys1a.net/mailingassets/e6cb622e84d47b5d0f84d6045c4d583d7c3bc2bd.gif",
};

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function escapeHtml(value: unknown = ""): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Converts Markdown-ish showcase copy to safe plain text before HTML escaping. */
export function stripMarkdown(value: unknown = ""): string {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+\. )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves relative URLs and rejects non-http(s) schemes. */
export function normalizeAbsoluteUrl(
  value: unknown,
  baseUrl: string = DEFAULT_BASE_URL,
): string | null {
  const candidate = cleanText(value, 2_000);
  if (!candidate) return null;

  let safeBase = DEFAULT_BASE_URL;
  try {
    const parsedBase = new URL(baseUrl);
    if (parsedBase.protocol === "http:" || parsedBase.protocol === "https:") {
      safeBase = parsedBase.href;
    }
  } catch {
    // Use the public Konglodigital URL as a deterministic safe fallback.
  }

  try {
    const parsed = new URL(candidate, safeBase);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Renders a deliberately small, email-safe subset of inline Markdown. */
export function renderInlineMarkdown(
  value: unknown,
  baseUrl: string = DEFAULT_BASE_URL,
): string {
  const replacements: string[] = [];
  const token = (html: string) => {
    const index = replacements.push(html) - 1;
    return `\u0000INLINE${index}\u0000`;
  };
  let source = String(value ?? "");

  source = source.replace(
    /!\[([^\]]*)\]\([^)]*\)/g,
    (_match, alt: string) => alt,
  );
  source = source.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const normalizedHref = normalizeAbsoluteUrl(href, baseUrl);
      if (!normalizedHref) return label;
      return token(
        `<a href="${escapeHtml(normalizedHref)}" style="color:${BLACK};font-weight:bold;text-decoration:underline;text-decoration-color:${PINK};text-decoration-thickness:2px;text-underline-offset:3px">${escapeHtml(label)}</a>`,
      );
    },
  );

  let output = escapeHtml(source);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/_([^_]+)_/g, "<em>$1</em>");
  return output.replace(/\u0000INLINE(\d+)\u0000/g, (_match, index: string) =>
    replacements[Number(index)] ?? "",
  );
}

export function normalizeNewsletterAspect(value: unknown): NewsletterAspect {
  const candidate = String(value ?? "original") as NewsletterAspect;
  return NEWSLETTER_ASPECTS.includes(candidate) ? candidate : "original";
}

export function normalizeNewsletterLayout(value: unknown): NewsletterLayout {
  return value === "stacked" ? "stacked" : "split";
}

export function normalizeNewsletterButton(
  value: Partial<NewsletterButtonItem> | null | undefined,
  baseUrl: string = DEFAULT_BASE_URL,
): NewsletterButtonItem | null {
  const title = cleanText(value?.title, 80);
  const href = normalizeAbsoluteUrl(value?.href, baseUrl);
  return title && href ? { type: "button", title, href } : null;
}

export function normalizeNewsletterBanner(
  value: Partial<NewsletterBannerItem> | null | undefined,
): NewsletterBannerItem | null {
  const title = cleanText(value?.title, 100);
  const content = cleanText(value?.content, 1_000);
  return title || content ? { type: "banner", title, content } : null;
}

function normalizeDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function normalizeNewsletterShowcase(
  value: NewsletterShowcase,
  baseUrl: string = DEFAULT_BASE_URL,
): NormalizedNewsletterShowcase | null {
  const id = cleanText(value?.id, 200);
  const title = cleanText(value?.title, 240);
  if (!id || !title) return null;

  const url = normalizeAbsoluteUrl(value.url, baseUrl);
  return {
    id,
    title,
    description: cleanText(value.description, 2_000),
    date: normalizeDate(value.date),
    url,
    imageUrl: normalizeAbsoluteUrl(value.imageUrl, baseUrl),
    subtitle: cleanText(value.subtitle, 160),
    layout: normalizeNewsletterLayout(value.layout),
    aspect: normalizeNewsletterAspect(value.aspect),
    showLink: value.showLink !== false && Boolean(url),
    linkText: cleanText(value.linkText, 80) || "Weiterlesen",
  };
}

export function normalizeNewsletterItems(
  items: readonly NewsletterItem[] | undefined,
  showcases: readonly NormalizedNewsletterShowcase[],
  baseUrl: string = DEFAULT_BASE_URL,
): NewsletterItem[] {
  const showcasesById = new Map(showcases.map((showcase) => [showcase.id, showcase]));
  const includedShowcases = new Set<string>();
  const normalized: NewsletterItem[] = [];

  for (const item of items?.slice(0, 200) ?? []) {
    if (item.type === "showcase") {
      const showcaseId = cleanText(item.showcaseId, 200);
      if (showcasesById.has(showcaseId) && !includedShowcases.has(showcaseId)) {
        normalized.push({ type: "showcase", showcaseId });
        includedShowcases.add(showcaseId);
      }
      continue;
    }
    if (item.type === "button") {
      const button = normalizeNewsletterButton(item, baseUrl);
      if (button) normalized.push(button);
      continue;
    }
    const banner = normalizeNewsletterBanner(item);
    if (banner) normalized.push(banner);
  }

  // Preserve the old builder behavior: selected showcases omitted from the
  // explicit item order are appended instead of silently disappearing.
  for (const showcase of showcases) {
    if (!includedShowcases.has(showcase.id)) {
      normalized.push({ type: "showcase", showcaseId: showcase.id });
    }
  }
  return normalized;
}

function germanDate(value: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${value}T12:00:00Z`));
}

function truncate(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength - 1).trim()}…`;
}

function imageBlock(showcase: NormalizedNewsletterShowcase, width: number): string {
  if (!showcase.imageUrl) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${LIGHT}" style="background:${LIGHT}">
      <tr><td align="center" valign="middle" height="188" style="color:${PINK};font:bold 48px/1 Arial,Helvetica,sans-serif;height:188px">#dit</td></tr>
    </table>`;
  }

  return `<img class="showcase-image" src="${escapeHtml(showcase.imageUrl)}" width="${width}" alt="${escapeHtml(showcase.title)}" draggable="false" style="border:0;display:block;height:auto;line-height:100%;max-width:${width}px;outline:none;text-decoration:none;width:100%;-ms-interpolation-mode:bicubic">`;
}

function showcaseCopy(showcase: NormalizedNewsletterShowcase): string {
  const kicker = showcase.subtitle || germanDate(showcase.date);
  const readMore = showcase.showLink && showcase.url
    ? `<a href="${escapeHtml(showcase.url)}" style="border-bottom:2px solid ${PINK};color:${PINK};font:bold 14px/1.3 Arial,Helvetica,sans-serif;text-decoration:none;text-transform:uppercase">${escapeHtml(showcase.linkText)}&nbsp;→</a>`
    : "";
  return `<p style="color:${PINK};font:bold 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;margin:0 0 9px;text-transform:uppercase">${escapeHtml(kicker)}</p>
    <h2 style="color:${BLACK};font:bold 25px/1.08 Arial,Helvetica,sans-serif;margin:0 0 11px;overflow-wrap:anywhere">${escapeHtml(showcase.title)}</h2>
    <p style="color:${BLACK};font:16px/1.45 Arial,Helvetica,sans-serif;margin:0 0 14px">${renderInlineMarkdown(showcase.description, showcase.url ?? DEFAULT_BASE_URL)}</p>
    ${readMore}`;
}

function divider(assets: NewsletterAssets): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="font-size:0;line-height:0"><img class="divider-image" src="${escapeHtml(assets.divider)}" width="540" alt="" style="border:0;display:block;height:auto;max-width:540px;width:100%;-ms-interpolation-mode:bicubic"></td></tr>
  </table>`;
}

function showcaseFrame(
  content: string,
  assets: NewsletterAssets,
  showDivider: boolean,
): string {
  return `<tr><td class="mobile-pad" style="padding:0 20px">
    ${showDivider ? divider(assets) : ""}
    ${showDivider ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="27" style="font-size:0;line-height:0">&nbsp;</td></tr></table>' : ""}
    ${content}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="28" style="font-size:0;line-height:0">&nbsp;</td></tr></table>
  </td></tr>`;
}

function showcaseBlock(
  showcase: NormalizedNewsletterShowcase,
  index: number,
  assets: NewsletterAssets,
  showDivider: boolean,
): string {
  if (showcase.layout === "stacked") {
    return showcaseFrame(
      `<table class="showcase-table showcase-table--stacked" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="left" style="padding:0 0 22px">${imageBlock(showcase, 540)}</td></tr>
        <tr><td align="left" style="color:${BLACK};font:16px/1.45 Arial,Helvetica,sans-serif;padding:0">${showcaseCopy(showcase)}</td></tr>
      </table>`,
      assets,
      showDivider,
    );
  }

  const reverse = index % 2 === 1;
  const imageCell = `<th class="stack-column stack-image" dir="ltr" width="46%" valign="top" align="left" style="font-weight:normal;padding:${reverse ? "0 0 0 18px" : "0 18px 0 0"};width:46%">${imageBlock(showcase, 248)}</th>`;
  const copyCell = `<th class="stack-column stack-copy" dir="ltr" width="54%" valign="top" align="left" style="color:${BLACK};font:16px/1.45 Arial,Helvetica,sans-serif;font-weight:normal;padding:${reverse ? "0 18px 0 0" : "0 0 0 18px"};width:54%">${showcaseCopy(showcase)}</th>`;
  return showcaseFrame(
    `<table class="showcase-table" role="presentation"${reverse ? ' dir="rtl"' : ""} width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${imageCell}${copyCell}</tr></table>`,
    assets,
    showDivider,
  );
}

function buttonBlock(item: NewsletterButtonItem): string {
  return `<tr><td class="mobile-pad custom-button-block" align="center" style="padding:0 20px 28px">
    <table class="custom-button" role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr><td align="center" bgcolor="${PINK}" style="background:${PINK}">
      <a href="${escapeHtml(item.href)}" title="${escapeHtml(item.title)}" style="border:1px solid ${PINK};color:#fff;display:inline-block;font:bold 14px/1 Arial,Helvetica,sans-serif;padding:14px 22px;text-decoration:none">${escapeHtml(item.title)}&nbsp;→</a>
    </td></tr></table>
  </td></tr>`;
}

function bannerBlock(item: NewsletterBannerItem): string {
  const title = item.title
    ? `<h2 style="color:#fff;font:bold 25px/1.12 Arial,Helvetica,sans-serif;margin:0${item.content ? " 0 12px" : ""}">${escapeHtml(item.title)}</h2>`
    : "";
  const content = item.content
    ? `<p style="color:#fff;font:16px/1.5 Arial,Helvetica,sans-serif;margin:0">${escapeHtml(item.content).replace(/\n/g, "<br>")}</p>`
    : "";
  return `<tr><td class="mobile-pad custom-banner-block" style="padding:0 20px 28px">
    <table class="custom-banner" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PINK}" style="background:${PINK};width:100%"><tr><td style="background:${PINK};color:#fff;padding:28px">${title}${content}</td></tr></table>
  </td></tr>`;
}

function newsletterContent(
  showcases: readonly NormalizedNewsletterShowcase[],
  items: readonly NewsletterItem[],
  assets: NewsletterAssets,
  showShowcasesHeading: boolean,
): string {
  const showcasesById = new Map(showcases.map((showcase) => [showcase.id, showcase]));
  let showcaseIndex = 0;
  return items
    .map((item) => {
      if (item.type === "button") return buttonBlock(item);
      if (item.type === "banner") return bannerBlock(item);
      const showcase = showcasesById.get(item.showcaseId);
      if (!showcase) return "";
      const markup = showcaseBlock(
        showcase,
        showcaseIndex,
        assets,
        showShowcasesHeading || showcaseIndex > 0,
      );
      showcaseIndex += 1;
      return markup;
    })
    .join("");
}

function validDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function localDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function eventDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(value).toUpperCase();
}

function eventTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function normalizeTimeZone(value: unknown): string {
  const candidate = cleanText(value, 100) || "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return "Europe/Berlin";
  }
}

interface NormalizedCalendarEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  url: string | null;
}

function normalizeCalendarEvents(
  calendar: NewsletterCalendar | undefined,
  baseUrl: string,
): NormalizedCalendarEvent[] {
  const normalized: NormalizedCalendarEvent[] = [];
  for (const event of calendar?.events ?? []) {
    const start = validDate(event.start);
    const end = validDate(event.end) ?? start;
    const title = cleanText(event.title, 240);
    if (!start || !end || !title) continue;
    normalized.push({
      title,
      start,
      end,
      allDay: event.allDay === true,
      location: cleanText(event.location, 240),
      url: normalizeAbsoluteUrl(event.url, baseUrl),
    });
  }
  return normalized.sort(
    (left, right) =>
      left.start.valueOf() - right.start.valueOf() ||
      left.title.localeCompare(right.title, "de"),
  );
}

function eventTimeRange(event: NormalizedCalendarEvent, timeZone: string): string {
  if (event.allDay) return "GANZTÄGIG";
  const start = eventTime(event.start, timeZone);
  const end = eventTime(event.end, timeZone);
  if (event.start.valueOf() === event.end.valueOf()) return `${start} UHR`;
  if (localDateKey(event.start, timeZone) !== localDateKey(event.end, timeZone)) {
    return `${start}–${eventDay(event.end, timeZone)} ${end} UHR`;
  }
  return `${start}–${end} UHR`;
}

function calendarSection(
  calendar: NewsletterCalendar | undefined,
  baseUrl: string,
  assets: NewsletterAssets,
): string {
  const timeZone = normalizeTimeZone(calendar?.timeZone);
  const daysAhead = Math.min(31, Math.max(1, Number(calendar?.daysAhead) || 7));
  const calendarUrl =
    normalizeAbsoluteUrl(calendar?.calendarUrl, baseUrl) ??
    normalizeAbsoluteUrl("/kalender", baseUrl) ??
    baseUrl;
  const events = normalizeCalendarEvents(calendar, baseUrl);
  const groups: Array<{ key: string; date: Date; events: NormalizedCalendarEvent[] }> = [];

  for (const event of events) {
    const key = localDateKey(event.start, timeZone);
    const previous = groups[groups.length - 1];
    if (!previous || previous.key !== key) {
      groups.push({ key, date: event.start, events: [event] });
    } else {
      previous.events.push(event);
    }
  }

  const eventMarkup = groups.length
    ? groups.map((group) => `<tr><td colspan="2" style="border-top:1px solid #d9d9d9;color:${PINK};font:bold 11px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1.2px;padding:16px 0 8px;text-transform:uppercase">${escapeHtml(eventDay(group.date, timeZone))}</td></tr>
      ${group.events.map((event) => {
        const title = escapeHtml(event.title);
        const titleMarkup = event.url
          ? `<a href="${escapeHtml(event.url)}" style="color:${BLACK};text-decoration:underline;text-decoration-color:${PINK};text-decoration-thickness:2px;text-underline-offset:3px">${title}</a>`
          : title;
        const location = event.location
          ? `<br><span style="color:#666;font:12px/1.4 Arial,Helvetica,sans-serif">${escapeHtml(event.location)}</span>`
          : "";
        return `<tr><td width="118" valign="top" style="color:${BLACK};font:bold 12px/1.4 Arial,Helvetica,sans-serif;padding:6px 14px 9px 0;width:118px">${escapeHtml(eventTimeRange(event, timeZone))}</td><td valign="top" style="color:${BLACK};font:bold 15px/1.35 Arial,Helvetica,sans-serif;padding:6px 0 9px">${titleMarkup}${location}</td></tr>`;
      }).join("")}`
    ).join("")
    : `<tr><td style="border-top:1px solid #d9d9d9;color:${BLACK};font:15px/1.5 Arial,Helvetica,sans-serif;padding:17px 0">Für die kommenden sieben Tage sind gerade keine öffentlichen Termine eingetragen.</td></tr>`;

  return `<tr><td class="mobile-pad calendar-section" style="padding:0 20px 30px">
    ${divider(assets)}
    <p style="color:${PINK};font:bold 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;margin:27px 0 7px;text-transform:uppercase">DIE NÄCHSTEN ${daysAhead} TAGE</p>
    <h2 style="color:${BLACK};font:900 28px/1.1 Arial,Helvetica,sans-serif;margin:0 0 17px">TERMINE DER WOCHE</h2>
    <table class="calendar-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${eventMarkup}</table>
    <table class="calendar-button" role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0"><tr><td align="center" bgcolor="${PINK}" style="background:${PINK}"><a href="${escapeHtml(calendarUrl)}" style="border:1px solid ${PINK};color:#fff;display:inline-block;font:bold 14px/1 Arial,Helvetica,sans-serif;padding:13px 18px;text-decoration:none">Ganzen Kalender anzeigen&nbsp;→</a></td></tr></table>
  </td></tr>`;
}

function normalizeAssets(
  assets: Partial<NewsletterAssets> | undefined,
  baseUrl: string,
): NewsletterAssets {
  const asset = (key: keyof NewsletterAssets) =>
    normalizeAbsoluteUrl(assets?.[key] ?? DEFAULT_NEWSLETTER_ASSETS[key], baseUrl) ??
    DEFAULT_NEWSLETTER_ASSETS[key];
  return {
    logo: asset("logo"),
    divider: asset("divider"),
    arrow: asset("arrow"),
    footer: asset("footer"),
  };
}

function templateHref(value: string | undefined, fallback: string, baseUrl: string): string {
  const candidate = cleanText(value, 2_000) || fallback;
  if (/^\{[A-Z0-9_:-]+\}$/.test(candidate)) return candidate;
  return normalizeAbsoluteUrl(candidate, baseUrl) ?? fallback;
}

function socialLink(label: string, href: string): string {
  return `<td align="center" style="padding:0 5px"><a href="${escapeHtml(href)}" style="display:inline-block;border:2px solid ${BLACK};border-radius:999px;color:${BLACK};font:bold 11px/1 Arial,Helvetica,sans-serif;padding:9px 10px;text-decoration:none">${escapeHtml(label)}</a></td>`;
}

/**
 * Produces a complete, responsive email document. All untrusted strings are
 * escaped and all href/src values are normalized to absolute http(s) URLs.
 */
export function renderNewsletter(options: RenderNewsletterOptions): string {
  const baseUrl =
    normalizeAbsoluteUrl(options.baseUrl ?? DEFAULT_BASE_URL, DEFAULT_BASE_URL) ??
    DEFAULT_BASE_URL;
  const showcases = options.showcases
    .map((showcase) => normalizeNewsletterShowcase(showcase, baseUrl))
    .filter((showcase): showcase is NormalizedNewsletterShowcase => Boolean(showcase));
  const items = normalizeNewsletterItems(options.items, showcases, baseUrl);
  const assets = normalizeAssets(options.assets, baseUrl);
  const title = cleanText(options.title, 240) || "Neues vom KNGLMRT";
  const subject = cleanText(options.subject, 240) || title;
  const intro = cleanText(options.intro, 5_000) ||
    "Hier kommen die neuesten Machenschaften aus dem Konglomerat.";
  const showShowcasesHeading = options.showShowcasesHeading !== false;
  const membershipUrl =
    normalizeAbsoluteUrl(options.membershipUrl ?? "/der-verein/mitglied-werden", baseUrl) ??
    baseUrl;
  const webviewHref = templateHref(options.webviewHref, "{WEBVIEW_LINK}", baseUrl);
  const unsubscribeHref = templateHref(
    options.unsubscribeHref,
    "{UNSUBSCRIBE_LINK}",
    baseUrl,
  );
  const newsUrl = normalizeAbsoluteUrl("/showcase", baseUrl) ?? baseUrl;
  const instagramUrl = "https://www.instagram.com/konglomerat.ev/";

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office"><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    html,body{height:100%!important;margin:0!important;padding:0!important;width:100%!important}
    body,table,td,th,a,p,h1,h2{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%}
    table,td,th{border-collapse:collapse!important;border-spacing:0!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important}
    img{-ms-interpolation-mode:bicubic;border:0;display:block;line-height:100%;outline:none;text-decoration:none}
    #outlook a{padding:0}.ReadMsgBody,.ExternalClass{width:100%}.ExternalClass,.ExternalClass p,.ExternalClass span,.ExternalClass font,.ExternalClass td,.ExternalClass th,.ExternalClass div{line-height:100%}
    a[x-apple-data-detectors],u+.email-body a,#MessageViewBody a{color:inherit;font:inherit;text-decoration:none}
    @media only screen and (max-width:620px){
      body.email-body,.email-center,.email-shell{background:#fff!important}.email-shell-cell{padding:0!important}.email-shell{width:100%!important}.email-container{max-width:100%!important;width:100%!important}.mobile-pad{padding-left:20px!important;padding-right:20px!important}
      .header-column,.stack-column,.footer-column{display:block!important;max-width:100%!important;width:100%!important}.header-logo{padding-top:14px!important;text-align:left!important}.header-logo img{margin-left:0!important}.stack-image{padding:0 0 18px!important}.stack-copy{padding:0!important}.showcase-image{max-width:100%!important;width:100%!important}.footer-column{padding:0 0 22px!important}.footer-column-last{padding-bottom:0!important}.section-title{font-size:25px!important}.webview{text-align:center!important}
    }
  </style>
</head>
<body class="email-body" style="background:${LIGHT_PINK};margin:0!important;padding:0!important;width:100%!important">
  <div style="display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;mso-hide:all;opacity:0;overflow:hidden;visibility:hidden">${escapeHtml(truncate(stripMarkdown(intro), 140))}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;</div>
  <center class="email-center" role="article" aria-roledescription="email" lang="de" style="background:${LIGHT_PINK};width:100%">
  <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${LIGHT_PINK}" style="background:${LIGHT_PINK};width:100%"><tr><td class="email-shell-cell" align="center" style="padding:12px 10px 28px">
    <table class="email-container" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%"><tr><td class="webview" align="right" style="color:${DARK_PINK};font:10px/1.4 Arial,Helvetica,sans-serif;padding:0 0 10px">Wird der Newsletter nicht richtig angezeigt? <a href="${escapeHtml(webviewHref)}" style="color:${DARK_PINK};text-decoration:underline">Webansicht öffnen</a>.</td></tr></table>
    <!--[if mso]><table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table class="email-container" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#fff;max-width:580px;width:100%">
      <tr><td class="mobile-pad" style="padding:20px 20px 13px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><th class="header-column" valign="middle" align="left" style="color:${BLACK};font:bold 12px/1.3 Arial,Helvetica,sans-serif;font-weight:bold;letter-spacing:.2px">${escapeHtml(title.toUpperCase())}</th><th class="header-column header-logo" align="right" valign="middle" style="font-weight:normal"><img src="${escapeHtml(assets.logo)}" width="150" alt="Konglomerat e.V." style="display:block;height:auto;margin-left:auto;max-width:150px;width:150px"></th></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="font-size:0;line-height:0">&nbsp;</td></tr></table>${divider(assets)}</td></tr>
      <tr><td class="mobile-pad intro-section" style="color:${BLACK};font:16px/1.5 Arial,Helvetica,sans-serif;padding:10px 20px ${showShowcasesHeading ? "22px" : "16px"}"><h1 style="color:${BLACK};font:bold 31px/1.1 Arial,Helvetica,sans-serif;margin:0 0 14px">Liebe Freund:innen,</h1>${intro.split(/\n{2,}/).map((paragraph) => `<p style="color:${BLACK};font:16px/1.5 Arial,Helvetica,sans-serif;margin:0 0 17px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}<p class="intro-signoff" style="color:${BLACK};font:bold italic 16px/1.5 Arial,Helvetica,sans-serif;margin:20px 0 ${showShowcasesHeading ? "22px" : "0"}">Wir sehen uns in der Werkstatt!</p>${showShowcasesHeading ? divider(assets) : ""}</td></tr>
      ${showShowcasesHeading ? `<tr><td class="mobile-pad" align="center" style="padding:18px 20px 30px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="80" valign="middle" style="padding:0 12px 0 0;width:80px"><img class="section-arrow" src="${escapeHtml(assets.arrow)}" width="80" alt="" style="border:0;display:block;height:auto;max-width:80px;width:80px;-ms-interpolation-mode:bicubic"></td><td valign="middle"><p class="section-title" style="color:${BLACK};font:900 29px/1.15 Arial,Helvetica,sans-serif;margin:0">WAS SO ABGEHT</p></td></tr></table></td></tr>` : ""}
      ${newsletterContent(showcases, items, assets, showShowcasesHeading)}
      ${calendarSection(options.calendar, baseUrl, assets)}
      <tr><td class="mobile-pad" align="center" style="padding:0 20px 20px">${divider(assets)}<p style="color:${BLACK};font:900 22px/1.2 Arial,Helvetica,sans-serif;margin:24px 0 18px">KONGLOMERAD:IN WERDEN!</p><!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(membershipUrl)}" style="height:44px;v-text-anchor:middle;width:190px" stroked="f" fillcolor="${PINK}"><w:anchorlock/><center style="color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">ICH BIN DABEI →</center></v:rect><![endif]--><!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="${PINK}" style="background:${PINK}"><a href="${escapeHtml(membershipUrl)}" style="border:1px solid ${PINK};color:#fff;display:inline-block;font:bold 14px/1 Arial,Helvetica,sans-serif;padding:14px 22px;text-decoration:none">ICH BIN DABEI&nbsp;→</a></td></tr></table><!--<![endif]--></td></tr>
      <tr><td align="center" style="padding:12px 15px 26px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${socialLink("Instagram", instagramUrl)}${socialLink("Hier entstanden", newsUrl)}</tr></table></td></tr>
      <tr><td align="center" style="padding:8px 20px 30px"><img class="footer-illustration" src="${escapeHtml(assets.footer)}" width="220" alt="Konglomerat e.V." style="border:0;display:block;height:auto;max-width:220px;width:100%;-ms-interpolation-mode:bicubic"></td></tr>
      <tr><td class="mobile-pad" bgcolor="${BLACK}" style="background:${BLACK};color:#fff;font:11px/1.55 Arial,Helvetica,sans-serif;padding:25px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><th class="footer-column" width="50%" valign="top" align="left" style="color:#fff;font:11px/1.55 Arial,Helvetica,sans-serif;font-weight:normal;padding:0;width:50%"><strong>Konglomerat e.V.</strong><br>Jagdweg 1–3 · 01159 Dresden<br><a href="mailto:vorstand@konglomerat.org" style="color:#fff;text-decoration:none">vorstand@konglomerat.org</a><br><br>SPENDENKONTO<br>IBAN: DE02 8306 5408 0004 7788 12<br>BIC: GENODEF1SLR</th><th class="footer-column footer-column-last" width="50%" valign="top" align="left" style="color:#fff;font:11px/1.55 Arial,Helvetica,sans-serif;font-weight:normal;padding:0 0 0 18px;width:50%">Du erhältst diese E-Mail, weil du als Empfänger:in des Newsletters „Neues vom Konglomerat“ eingetragen bist.<br><br><a href="${escapeHtml(unsubscribeHref)}" style="color:${PINK}">Newsletter abbestellen</a><br>CC-BY-SA 4.0 · Konglomerat e.V.</th></tr></table></td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table></center>
</body>
</html>`;
}
