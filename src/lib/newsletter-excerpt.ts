export const NEWSLETTER_EXCERPT_LIMIT = 520;

/** The editor and renderer count exactly the same visible source text. */
export function cleanNewsletterExcerpt(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+\. )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function newsletterExcerptLength(value: string): number {
  return Array.from(cleanNewsletterExcerpt(value)).length;
}

export function shortenNewsletterExcerpt(value: string): string {
  const text = cleanNewsletterExcerpt(value);
  const characters = Array.from(text);
  if (characters.length <= NEWSLETTER_EXCERPT_LIMIT) return text;
  const prefix = characters.slice(0, NEWSLETTER_EXCERPT_LIMIT - 1).join("");
  const lastSpace = prefix.lastIndexOf(" ");
  return `${(lastSpace > prefix.length * 0.75 ? prefix.slice(0, lastSpace) : prefix).trimEnd()}…`;
}
