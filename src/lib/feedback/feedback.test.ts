import { describe, expect, it } from "vitest";

import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_NAME_MAX,
  buildGithubFeedbackBody,
  formatPublicFeedbackName,
  deriveFeedbackTitle,
  describeFeedbackEnvironment,
  neutralizeGithubMentions,
  parseFeedbackContext,
  parseFeedbackSubmission,
} from "./feedback";

const context = parseFeedbackContext({
  path: "/de/receipts",
  viewportWidth: 1440,
  viewportHeight: 900,
  screenWidth: 1920,
  screenHeight: 1080,
  pixelRatio: 2,
  language: "de",
});
const environment = { browser: "Chrome 142", os: "macOS", device: "Desktop" };

describe("parseFeedbackContext", () => {
  it("drops query and hash from the path", () => {
    expect(parseFeedbackContext({ path: "/a/b?token=1#x" }).path).toBe("/a/b");
  });

  it("rejects paths that could break the markdown table", () => {
    expect(parseFeedbackContext({ path: "/a|`b`" }).path).toBe("unbekannt");
    expect(parseFeedbackContext({ path: "https://evil.test" }).path).toBe(
      "unbekannt",
    );
  });

  it("ignores implausible sizes", () => {
    const parsed = parseFeedbackContext({ viewportWidth: -1, pixelRatio: 99 });
    expect(parsed.viewportWidth).toBeNull();
    expect(parsed.pixelRatio).toBeNull();
  });
});

describe("parseFeedbackSubmission", () => {
  const valid = {
    type: "bug",
    name: "  Mika   Muster ",
    message: " Klemmt ",
    context,
  };

  it("trims name and message", () => {
    expect(parseFeedbackSubmission(valid)).toMatchObject({
      name: "Mika Muster",
      message: "Klemmt",
      title: "Klemmt",
    });
  });

  it("drops the technical context of an idea", () => {
    const idea = parseFeedbackSubmission({ ...valid, type: "feature" });
    expect(idea?.context).toMatchObject({
      path: "unbekannt",
      viewportWidth: null,
      screenWidth: null,
    });
  });

  it("requires a name of reasonable length", () => {
    expect(parseFeedbackSubmission({ ...valid, name: "   " })).toBeNull();
    expect(parseFeedbackSubmission({ ...valid, name: null })).toBeNull();
    expect(
      parseFeedbackSubmission({
        ...valid,
        name: "x".repeat(FEEDBACK_NAME_MAX + 1),
      }),
    ).toBeNull();
  });

  it("rejects unknown types, empty and oversized messages", () => {
    expect(parseFeedbackSubmission({ ...valid, type: "spam" })).toBeNull();
    expect(parseFeedbackSubmission({ ...valid, message: "   " })).toBeNull();
    expect(
      parseFeedbackSubmission({
        ...valid,
        message: "x".repeat(FEEDBACK_MESSAGE_MAX + 1),
      }),
    ).toBeNull();
  });
});

describe("deriveFeedbackTitle", () => {
  it("uses the first line without markdown markers", () => {
    expect(deriveFeedbackTitle("\n## Der Knopf\nDetails")).toBe("Der Knopf");
  });

  it("shortens long lines at a word boundary", () => {
    const title = deriveFeedbackTitle("wort ".repeat(40));
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("wort…")).toBe(true);
  });
});

describe("describeFeedbackEnvironment", () => {
  it("recognizes desktop Chrome on macOS", () => {
    expect(
      describeFeedbackEnvironment(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        false,
      ),
    ).toEqual({ browser: "Chrome 142", os: "macOS", device: "Desktop" });
  });

  it("recognizes an iPhone", () => {
    expect(
      describeFeedbackEnvironment(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        true,
      ),
    ).toEqual({ browser: "Safari 18", os: "iOS", device: "Smartphone" });
  });

  it("recognizes an iPad posing as a Mac", () => {
    expect(
      describeFeedbackEnvironment(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        true,
      ),
    ).toEqual({ browser: "Safari 18", os: "iPadOS", device: "Tablet" });
  });
});

describe("neutralizeGithubMentions", () => {
  it("breaks mentions but leaves email addresses alone", () => {
    expect(neutralizeGithubMentions("Hallo @vincent")).toBe(
      "Hallo @​vincent",
    );
    expect(neutralizeGithubMentions("a@example.org")).toBe("a@example.org");
  });
});

describe("formatPublicFeedbackName", () => {
  it.each([
    ["Mika Muster", "Mika M."],
    ["  Mika   Muster ", "Mika M."],
    ["Anna Maria von Berg", "Anna B."],
    ["Jo Müller-Lüdenscheidt", "Jo M."],
    ["mika östlich", "mika Ö."],
    ["Mika M.", "Mika M."],
    ["Mika", "Mika"],
  ])("turns %s into %s", (name, expected) => {
    expect(formatPublicFeedbackName(name)).toBe(expected);
  });
});

describe("buildGithubFeedbackBody", () => {
  it("credits the sender without letting the name format or ping", () => {
    const body = (name: string) =>
      buildGithubFeedbackBody({
        type: "bug",
        name,
        message: "Klemmt",
        context,
        environment,
        screenshotUrl: null,
      });
    expect(body("@mika Muster")).toContain("Gesendet von **@​mika M.**");
    expect(body("*mika* Muster")).toContain("Gesendet von **\\*mika\\* M.**");
    expect(body("Mika Muster")).not.toContain("Muster");
  });

  it("collapses the context of a bug", () => {
    const body = buildGithubFeedbackBody({
      type: "bug",
      name: "Mika Muster",
      message: "Klemmt",
      context,
      environment,
      screenshotUrl: null,
    });
    expect(body).toContain("<details>\n<summary>Kontext</summary>\n\n| Feld");
    expect(body).toMatch(/\|\n\n<\/details>$/);
  });

  it("leaves the context out of an idea", () => {
    const body = buildGithubFeedbackBody({
      type: "feature",
      name: "Mika Muster",
      message: "Dunkler Modus",
      context,
      environment,
      screenshotUrl: null,
    });
    expect(body).not.toContain("<details>");
    expect(body).not.toContain("/de/receipts");
    expect(body).not.toContain("Chrome");
  });

  it("contains message, screenshot and context", () => {
    const body = buildGithubFeedbackBody({
      type: "bug",
      name: "Mika Muster",
      message: "Klemmt",
      context,
      environment,
      screenshotUrl: "https://media.test/t/feedback/a.jpg",
    });
    expect(body).toContain("Klemmt");
    expect(body).toContain("![Screenshot](https://media.test/t/feedback/a.jpg)");
    expect(body).toContain("| Seite | `/de/receipts` |");
    expect(body).toContain("| Fenster | `1440 × 900` |");
  });

  it("omits the image when there is no screenshot", () => {
    const body = buildGithubFeedbackBody({
      type: "bug",
      name: "Mika Muster",
      message: "Klemmt",
      context,
      environment,
      screenshotUrl: null,
    });
    expect(body).not.toContain("![Screenshot]");
  });
});
