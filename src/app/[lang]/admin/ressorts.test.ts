import { describe, expect, it } from "vitest";

import type { UserAccess } from "@/lib/access/access";
import type { RoleName } from "@/lib/access/role-config";

import { getRessort, getVerwaltungEntryHref, getVisibleRessorts } from "./ressorts";

const accessWith = (
  ...entries: [RoleName, string | null][]
): UserAccess => ({
  userId: "user-1",
  assignments: entries.map(([role, scopeId]) => ({
    id: `${role}-${scopeId ?? "global"}`,
    userId: "user-1",
    role,
    scopeId,
    grantedBy: null,
    createdAt: null,
  })),
});

const visibleIds = (access: UserAccess | null) =>
  getVisibleRessorts(access).map((ressort) => ressort.id);

const visibleChildren = (access: UserAccess, id: Parameters<typeof getRessort>[0]) =>
  (getRessort(id).children ?? [])
    .filter((child) => child.canOpen(access))
    .map((child) => child.label);

describe("Verwaltungsmenü", () => {
  it("zeigt ohne Rolle nichts", () => {
    expect(visibleIds(null)).toEqual([]);
    expect(visibleIds(accessWith())).toEqual([]);
    expect(getVerwaltungEntryHref(null)).toBeNull();
  });

  it("zeigt admin alles", () => {
    expect(visibleIds(accessWith(["admin", null]))).toEqual([
      "buchhaltung",
      "vorstand",
      "admin",
      "vhc",
      "oeffentlichkeitsarbeit",
    ]);
  });

  it("zeigt tools im VHC nur das VHC", () => {
    const access = accessWith(["tools", "vhc"]);
    expect(visibleIds(access)).toEqual(["vhc"]);
    expect(getVerwaltungEntryHref(access)).toBe("/admin/volkshaus");
  });

  it("zeigt Bereichs-Buchhaltung die Buchhaltung, aber kein KoFi", () => {
    const access = accessWith(["buchhaltung", "holz"]);
    expect(visibleIds(access)).toEqual(["buchhaltung"]);
  });

  it("zeigt Vorstand nur der Rolle Vorstand, nicht der Buchhaltung", () => {
    expect(visibleIds(accessWith(["buchhaltung", null]))).toEqual([
      "buchhaltung",
    ]);
    const access = accessWith(["vorstand", null]);
    expect(visibleIds(access)).toEqual(["vorstand"]);
    expect(visibleChildren(access, "vorstand")).toEqual([
      "KoFi",
      "Ehrenamtsbonus",
    ]);
  });

  it("zeigt Admin ohne Rolle Admin nicht", () => {
    expect(visibleIds(accessWith(["cms", "holz"]))).toEqual([]);
  });
});
