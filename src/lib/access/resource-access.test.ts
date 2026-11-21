import { describe, expect, it } from "vitest";

import type { UserAccess } from "@/lib/access/access";
import {
  canDeleteResource,
  canEditResource,
} from "@/lib/access/resource-access";
import type { RoleName } from "@/lib/access/role-config";

const accessWith = (...roles: RoleName[]): UserAccess => ({
  userId: "me",
  assignments: roles.map((role) => ({
    id: role,
    userId: "me",
    role,
    scopeId: null,
    grantedBy: null,
    createdAt: null,
  })),
});

const ownTool = { ownerId: "me", type: "tool" };
const foreignTool = { ownerId: "other", type: "tool" };
const ownShowcase = { ownerId: "me", type: "project" };
const foreignShowcase = { ownerId: "other", type: "project" };

describe("Inventar", () => {
  it("lässt eigene bearbeiten, aber nur mit der Rolle löschen", () => {
    expect(canEditResource(accessWith(), ownTool)).toBe(true);
    expect(canDeleteResource(accessWith(), ownTool)).toBe(false);
    expect(canEditResource(accessWith(), foreignTool)).toBe(false);
  });

  it("lässt die Rolle Inventar alles bearbeiten und löschen", () => {
    expect(canEditResource(accessWith("inventar"), foreignTool)).toBe(true);
    expect(canDeleteResource(accessWith("inventar"), foreignTool)).toBe(true);
    expect(canEditResource(accessWith("admin"), foreignTool)).toBe(true);
  });

  it("gibt die Showcase-Rolle keine Inventarrechte", () => {
    expect(canEditResource(accessWith("showcase"), foreignTool)).toBe(false);
  });

  it("verweigert ohne Anmeldung", () => {
    expect(canEditResource(null, foreignTool)).toBe(false);
    expect(canDeleteResource(undefined, foreignTool)).toBe(false);
  });
});

describe("Showcases", () => {
  it("erlaubt eigene ohne Rolle", () => {
    expect(canEditResource(accessWith(), ownShowcase)).toBe(true);
    expect(canDeleteResource(accessWith(), ownShowcase)).toBe(true);
  });

  it("erlaubt fremde nur mit der Rolle Showcase", () => {
    expect(canEditResource(accessWith(), foreignShowcase)).toBe(false);
    expect(canEditResource(accessWith("inventar"), foreignShowcase)).toBe(false);
    expect(canEditResource(accessWith("showcase"), foreignShowcase)).toBe(true);
    expect(canDeleteResource(accessWith("showcase"), foreignShowcase)).toBe(
      true,
    );
  });

  it("zählt fehlende Eigentümer nicht als eigene", () => {
    expect(
      canEditResource(accessWith(), { ownerId: null, type: "project" }),
    ).toBe(false);
  });
});
