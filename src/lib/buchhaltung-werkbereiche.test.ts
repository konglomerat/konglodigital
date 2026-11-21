import { describe, expect, it } from "vitest";

import { ALL_SCOPES } from "@/lib/access/access";
import type { Scope } from "@/lib/access/scopes";
import {
  canEditReceiptCostCenters,
  canViewReceiptCostCenters,
  filterAllowedCostCenters,
  filterAllowedWerkbereiche,
  getAllowedCostCenters,
  isCostCenterAllowed,
  toBuchhaltungWerkbereiche,
} from "@/lib/buchhaltung-werkbereiche";

const SCOPES: Scope[] = [
  { id: "holz", name: "Holz", type: "werkbereich", campaiCostCenter: "57" },
  { id: "laser", name: "Laser", type: "werkbereich", campaiCostCenter: "59" },
  { id: "forum", name: "FOR:UM", type: "projekt", campaiCostCenter: "73" },
  { id: "ohne", name: "Ohne KST", type: "projekt", campaiCostCenter: null },
];

describe("getAllowedCostCenters", () => {
  it("reicht ALL_SCOPES durch", () => {
    expect(getAllowedCostCenters(ALL_SCOPES, SCOPES)).toBe(ALL_SCOPES);
  });

  it("übersetzt Bereiche in ihre Kostenstellen", () => {
    expect(getAllowedCostCenters(["laser", "holz"], SCOPES)).toEqual([
      "57",
      "59",
    ]);
  });

  it("überspringt unbekannte Bereiche und Bereiche ohne Kostenstelle", () => {
    expect(getAllowedCostCenters(["ohne", "gibts-nicht"], SCOPES)).toEqual([]);
  });
});

describe("isCostCenterAllowed", () => {
  it("erlaubt global alles, auch Belege ohne Kostenstelle", () => {
    expect(isCostCenterAllowed("50", ALL_SCOPES)).toBe(true);
    expect(isCostCenterAllowed(null, ALL_SCOPES)).toBe(true);
  });

  it("erlaubt die Kostenstelle und ihre Unterprojekte", () => {
    expect(isCostCenterAllowed("57", ["57"])).toBe(true);
    expect(isCostCenterAllowed(571, ["57"])).toBe(true);
    expect(isCostCenterAllowed("578", ["57"])).toBe(true);
  });

  it("sperrt fremde Kostenstellen und Belege ohne Kostenstelle", () => {
    expect(isCostCenterAllowed("59", ["57"])).toBe(false);
    expect(isCostCenterAllowed("591", ["57"])).toBe(false);
    expect(isCostCenterAllowed("5", ["57"])).toBe(false);
    expect(isCostCenterAllowed(null, ["57"])).toBe(false);
    expect(isCostCenterAllowed(undefined, ["57"])).toBe(false);
    expect(isCostCenterAllowed("57", [])).toBe(false);
  });
});

describe("Bereichsfilter der Buchhaltung", () => {
  it("filtert angefragte Kostenstellen auf die erlaubten", () => {
    expect(filterAllowedCostCenters([57, 571, 59, 73, 731, 50], ["57", "73"]))
      .toEqual([57, 571, 73, 731]);
    expect(filterAllowedCostCenters([57, 50], ALL_SCOPES)).toEqual([57, 50]);
    expect(filterAllowedCostCenters([57, 50], [])).toEqual([]);
  });

  it("zeigt nur die Werkbereiche der eigenen Bereiche", () => {
    const werkbereiche = toBuchhaltungWerkbereiche([
      { value: "50", label: "Basis" },
      { value: "57", label: "Holz" },
      { value: "571", label: "Holz_Bestellungen" },
      { value: "59", label: "Laser" },
      { value: "73", label: "#FOR:UM" },
    ]);

    const allowed = getAllowedCostCenters(["holz", "forum"], SCOPES);
    expect(
      filterAllowedWerkbereiche(werkbereiche, allowed).map(
        (werkbereich) => werkbereich.value,
      ),
    ).toEqual(["57", "73"]);
    expect(filterAllowedWerkbereiche(werkbereiche, ALL_SCOPES)).toHaveLength(4);
  });
});

describe("Einzelbelege", () => {
  it("zeigt einen Beleg, sobald eine Position erlaubt ist", () => {
    expect(canViewReceiptCostCenters([57, 59], ["57"])).toBe(true);
    expect(canViewReceiptCostCenters([59, null], ["57"])).toBe(false);
    expect(canViewReceiptCostCenters([], ["57"])).toBe(false);
    expect(canViewReceiptCostCenters([], ALL_SCOPES)).toBe(true);
  });

  it("lässt nur ändern, wenn alle Positionen erlaubt sind", () => {
    expect(canEditReceiptCostCenters([57, 571], ["57"])).toBe(true);
    expect(canEditReceiptCostCenters([57, 59], ["57"])).toBe(false);
    expect(canEditReceiptCostCenters([57, null], ["57"])).toBe(false);
    expect(canEditReceiptCostCenters([], ["57"])).toBe(false);
    expect(canEditReceiptCostCenters([null], ALL_SCOPES)).toBe(true);
  });
});
