import { describe, expect, it } from "vitest";

import {
  describeContracts,
  quarterBounds,
  type AccessContract,
} from "@/lib/campai-tariff-change";

const contract = (
  tariff: AccessContract["tariff"],
  startDay: string | null,
  endDay: string | null = null,
): AccessContract => ({
  raw: {},
  id: `${tariff}-${startDay}`,
  tariff,
  startDay,
  endDay,
});

const TODAY = "2026-10-07";

describe("quarterBounds", () => {
  it("nennt Quartalsende und nächsten Quartalsersten", () => {
    expect(quarterBounds(new Date("2026-10-07T10:00:00Z"))).toEqual({
      today: "2026-10-07",
      currentQuarterEnd: "2026-12-31",
      nextChangeDate: "2027-01-01",
    });
  });

  it("rechnet in Berliner Zeit, nicht in UTC", () => {
    // 31.12. 23:30 UTC ist in Berlin schon der 1.1. — neues Quartal.
    expect(quarterBounds(new Date("2026-12-31T23:30:00Z"))).toEqual({
      today: "2027-01-01",
      currentQuarterEnd: "2027-03-31",
      nextChangeDate: "2027-04-01",
    });
  });
});

describe("describeContracts", () => {
  it("findet das laufende Abo ohne vorgemerkten Wechsel", () => {
    const abo = contract("abo_klein", "2026-08-01");
    const result = describeContracts([abo], TODAY);
    expect(result.current).toBe("abo_klein");
    expect(result.runningAbo).toBe(abo);
    expect(result.pending).toBeNull();
  });

  it("wertet ein künftiges Abo als vorgemerkten Wechsel", () => {
    const result = describeContracts(
      [
        contract("abo_klein", "2026-08-01", "2026-12-31"),
        contract("abo_gross", "2027-01-01"),
      ],
      TODAY,
    );
    expect(result.current).toBe("abo_klein");
    expect(result.pending).toEqual({
      tariff: "abo_gross",
      effectiveFrom: "2027-01-01",
    });
  });

  it("wertet ein gekündigtes Abo als Wechsel zu keiner Karte", () => {
    const result = describeContracts(
      [contract("abo_gross", "2026-01-01", "2026-12-31")],
      TODAY,
    );
    expect(result.pending).toEqual({
      tariff: "keiner",
      effectiveFrom: "2027-01-01",
    });
  });

  it("lässt nach dem Abo eine laufende 10er Karte stehen", () => {
    const result = describeContracts(
      [
        contract("abo_gross", "2026-01-01", "2026-12-31"),
        contract("punktekarte", "2026-10-01"),
      ],
      TODAY,
    );
    expect(result.current).toBe("abo_gross");
    expect(result.pending?.tariff).toBe("punktekarte");
  });

  it("übergeht Alteinträge, die vor ihrem Beginn enden", () => {
    const result = describeContracts(
      [contract("punktekarte", "2026-08-05", "2026-08-04")],
      TODAY,
    );
    expect(result.current).toBe("keiner");
    expect(result.pending).toBeNull();
  });

  it("zählt eine 10er Karte ohne Ende als laufend", () => {
    const result = describeContracts(
      [contract("punktekarte", "2026-09-23")],
      TODAY,
    );
    expect(result.current).toBe("punktekarte");
    expect(result.runningAbo).toBeNull();
    expect(result.pending).toBeNull();
  });
});
