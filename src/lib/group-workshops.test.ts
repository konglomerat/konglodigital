import { describe, expect, it } from "vitest";

import {
  formatGroupSize,
  getGroupWorkshop,
  groupWorkshopHref,
  listGroupWorkshops,
} from "./group-workshops";
import { findArea } from "./workshops";

describe("Workshops für Gruppen (Platzhalter)", () => {
  it("hat eindeutige, URL-taugliche Slugs", async () => {
    const slugs = (await listGroupWorkshops()).map((workshop) => workshop.slug);
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("verweist nur auf bekannte Werkbereiche", async () => {
    for (const workshop of await listGroupWorkshops()) {
      expect(findArea(workshop.area), workshop.slug).not.toBeNull();
    }
  });

  it("hat sinnvolle Gruppengrößen und mindestens ein Bild", async () => {
    for (const workshop of await listGroupWorkshops()) {
      expect(workshop.groupSize.min, workshop.slug).toBeGreaterThan(0);
      expect(workshop.groupSize.min, workshop.slug).toBeLessThanOrEqual(
        workshop.groupSize.max,
      );
      expect(workshop.images.length, workshop.slug).toBeGreaterThan(0);
    }
  });

  it("findet einen Workshop über den Slug", async () => {
    expect((await getGroupWorkshop("blinkender-anstecker"))?.title).toBe(
      "Blinkender Anstecker",
    );
    expect(await getGroupWorkshop("gibt-es-nicht")).toBeNull();
  });
});

describe("formatGroupSize", () => {
  it("schreibt Spannen mit Bis-Strich", () => {
    expect(formatGroupSize({ min: 8, max: 16 })).toBe("8–16 Pers.");
  });

  it("fasst gleiche Grenzen zusammen", () => {
    expect(formatGroupSize({ min: 12, max: 12 })).toBe("12 Pers.");
  });
});

describe("groupWorkshopHref", () => {
  it("zeigt auf die Detailseite", () => {
    expect(groupWorkshopHref("vogelhaus-bauen")).toBe("/workshops/gruppen/vogelhaus-bauen");
  });
});
