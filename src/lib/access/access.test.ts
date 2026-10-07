import { describe, expect, it } from "vitest";

import {
  ALL_SCOPES,
  type RoleAssignment,
  type UserAccess,
  allowedScopes,
  can,
  canAnywhere,
  canGrantRole,
  canManageAccess,
  getAssignmentShapeError,
} from "@/lib/access/access";
import type { RoleName } from "@/lib/access/role-config";

const assignment = (
  role: RoleName,
  scopeId: string | null = null,
): RoleAssignment => ({
  id: `${role}-${scopeId ?? "global"}`,
  userId: "user-1",
  role,
  scopeId,
  grantedBy: null,
  createdAt: null,
});

const accessWith = (...assignments: RoleAssignment[]): UserAccess => ({
  userId: "user-1",
  assignments,
});

describe("can", () => {
  it("verweigert ohne Nutzer oder ohne Zuweisungen", () => {
    expect(can(null, "receipts.view")).toBe(false);
    expect(can(undefined, "receipts.view", { scope: "holz" })).toBe(false);
    expect(can(accessWith(), "receipts.view")).toBe(false);
  });

  it("erlaubt eine globale Zuweisung ohne und mit Bereich", () => {
    const access = accessWith(assignment("buchhaltung"));
    expect(can(access, "receipts.view")).toBe(true);
    expect(can(access, "receipts.view", { scope: "holz" })).toBe(true);
  });

  it("erlaubt eine Bereichszuweisung nur im passenden Bereich", () => {
    const access = accessWith(assignment("buchhaltung", "holz"));
    expect(can(access, "receipts.view", { scope: "holz" })).toBe(true);
    expect(can(access, "receipts.view", { scope: "laser" })).toBe(false);
  });

  it("zählt eine Bereichszuweisung nicht als global", () => {
    const access = accessWith(assignment("buchhaltung", "holz"));
    expect(can(access, "receipts.view")).toBe(false);
    expect(can(access, "receipts.view", { scope: null })).toBe(false);
  });

  it("prüft Berechtigungen, nicht Rollennamen", () => {
    const access = accessWith(assignment("vorstand"));
    expect(can(access, "kofi.view")).toBe(true);
    expect(can(access, "receipts.view")).toBe(false);
  });

  it("gibt admin jede Berechtigung", () => {
    const access = accessWith(assignment("admin"));
    expect(can(access, "receipts.edit", { scope: "riso" })).toBe(true);
    expect(can(access, "volkshaus.bookings.manage", { scope: "vhc" })).toBe(
      true,
    );
    expect(can(access, "access.manage")).toBe(true);
  });

  it("gibt tools im Bereich vhc die Raumbuchung, aber nicht anderswo", () => {
    const access = accessWith(assignment("tools", "vhc"));
    expect(can(access, "volkshaus.bookings.manage", { scope: "vhc" })).toBe(
      true,
    );
    expect(can(access, "volkshaus.bookings.manage", { scope: "forum" })).toBe(
      false,
    );
    expect(can(access, "volkshaus.bookings.manage")).toBe(false);
  });

  it("ignoriert Zuweisungen anderer Rollen im selben Bereich", () => {
    const access = accessWith(assignment("cms", "holz"));
    expect(can(access, "receipts.view", { scope: "holz" })).toBe(false);
    expect(can(access, "content.edit", { scope: "holz" })).toBe(true);
  });
});

describe("allowedScopes", () => {
  it("liefert ALL_SCOPES bei globaler Zuweisung", () => {
    const access = accessWith(
      assignment("buchhaltung", "holz"),
      assignment("buchhaltung"),
    );
    expect(allowedScopes(access, "receipts.view")).toBe(ALL_SCOPES);
  });

  it("liefert die Bereiche sortiert und ohne Doppel", () => {
    const access = accessWith(
      assignment("buchhaltung", "riso"),
      assignment("buchhaltung", "holz"),
      assignment("cms", "laser"),
    );
    expect(allowedScopes(access, "receipts.view")).toEqual(["holz", "riso"]);
    expect(allowedScopes(access, "content.edit")).toEqual(["laser"]);
  });

  it("liefert eine leere Liste ohne passende Zuweisung", () => {
    expect(allowedScopes(null, "receipts.view")).toEqual([]);
    expect(
      allowedScopes(accessWith(assignment("vorstand")), "receipts.view"),
    ).toEqual([]);
  });

  it("passt zu canAnywhere", () => {
    expect(
      canAnywhere(accessWith(assignment("buchhaltung", "holz")), "receipts.view"),
    ).toBe(true);
    expect(canAnywhere(accessWith(assignment("cms")), "receipts.view")).toBe(
      false,
    );
  });
});

describe("Vergabe", () => {
  it("lehnt globale Rollen mit Bereich ab", () => {
    expect(getAssignmentShapeError("vorstand", "holz")).not.toBeNull();
    expect(getAssignmentShapeError("vorstand", null)).toBeNull();
    expect(getAssignmentShapeError("buchhaltung", "holz")).toBeNull();
  });

  it("lässt admin alles vergeben, was die Config erlaubt", () => {
    const access = accessWith(assignment("admin"));
    expect(canManageAccess(access)).toBe(true);
    expect(canGrantRole(access, "buchhaltung", "holz")).toBe(true);
    expect(canGrantRole(access, "vorstand", null)).toBe(true);
    expect(canGrantRole(access, "vorstand", "holz")).toBe(false);
  });

  it("lässt alle anderen nichts vergeben", () => {
    const access = accessWith(
      assignment("buchhaltung", "holz"),
      assignment("vorstand"),
    );
    expect(canManageAccess(access)).toBe(false);
    expect(canGrantRole(access, "buchhaltung", "holz")).toBe(false);
    expect(canGrantRole(access, "vorstand", null)).toBe(false);
  });
});
