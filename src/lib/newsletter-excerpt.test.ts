import { describe, expect, it } from "vitest";
import { cleanNewsletterExcerpt, newsletterExcerptLength, shortenNewsletterExcerpt } from "./newsletter-excerpt";

describe("Newsletter excerpts", () => {
  it("counts exactly the normalized text used in email output", () => {
    expect(cleanNewsletterExcerpt("# Hallo\n\n- Werkstatt  heute")).toBe("Hallo Werkstatt heute");
    expect(newsletterExcerptLength("# Hallo\n\n- Werkstatt  heute")).toBe(21);
  });
  it("keeps a fitting text intact and shortens a long one at a word boundary", () => {
    expect(shortenNewsletterExcerpt("x".repeat(520))).toHaveLength(520);
    const shortened = shortenNewsletterExcerpt("Werkstatt ".repeat(100));
    expect(shortened).toMatch(/Werkstatt…$/);
    expect(newsletterExcerptLength(shortened)).toBeLessThanOrEqual(520);
  });
  it("does not split emoji surrogate pairs", () => {
    const shortened = shortenNewsletterExcerpt("🔧".repeat(600));
    expect(Array.from(shortened)).toHaveLength(520);
    expect(shortened).not.toContain("�");
  });
});
