import { describe, expect, it } from "vitest";

import {
  buildReceiptUpdatePayload,
  computeReceiptTotals,
  formatAuthoredNote,
  isReceiptFullyEditable,
  parseReceiptNote,
} from "./receipt-edit";

const rateByCode = new Map([
  ["VS19", 19],
  ["VS7", 7],
  ["US19", 19],
]);

const expense = {
  _id: "r1",
  type: "expense",
  account: 70001,
  accountName: "Baumarkt",
  receiptNumber: "B-1",
  isNet: false,
  totalGrossAmount: 3570,
  receiptDate: "2026-10-19T00:00:00.000Z",
  dueDate: "2026-11-16T00:00:00.000Z",
  description: "",
  paymentStatus: "unpaid",
  payments: [],
  canceledAt: null,
  positions: [
    { account: 4900, amount: 3570, taxCode: "VS19", costCenter1: 3, costCenter2: 51, description: "Holz" },
  ],
};

describe("isReceiptFullyEditable", () => {
  it("is true only for unpaid receipts without payments", () => {
    expect(isReceiptFullyEditable(expense)).toBe(true);
    expect(isReceiptFullyEditable({ ...expense, paymentStatus: "partial" })).toBe(false);
    expect(isReceiptFullyEditable({ ...expense, payments: [{ amount: 1 }] })).toBe(false);
    expect(isReceiptFullyEditable({ ...expense, canceledAt: "2026-11-01" })).toBe(false);
    expect(isReceiptFullyEditable({ ...expense, type: "donation" })).toBe(false);
  });
});

describe("computeReceiptTotals", () => {
  it("rounds tax per tax code for net receipts", () => {
    expect(
      computeReceiptTotals({
        type: "expense",
        isNet: true,
        positions: [
          { amount: 1000, taxCode: "VS19" },
          { amount: 1001, taxCode: "VS19" },
          { amount: 500, taxCode: "VS7" },
        ],
        rateByCode,
      }),
    ).toEqual({ net: 2501, tax: 380 + 35, gross: 2501 + 415 });
  });

  it("extracts tax from gross receipts", () => {
    expect(
      computeReceiptTotals({ type: "expense", isNet: false, positions: [{ amount: 3570, taxCode: "VS19" }], rateByCode }),
    ).toEqual({ net: 3000, tax: 570, gross: 3570 });
  });

  it("uses quantity × unit price for invoices", () => {
    expect(
      computeReceiptTotals({
        type: "invoice",
        isNet: true,
        positions: [{ quantity: 0.6, unitAmount: 7500, taxCode: "US19" }, { quantity: 2, unitAmount: 750, taxCode: "US19" }],
        rateByCode,
      }),
    ).toEqual({ net: 6000, tax: 1140, gross: 7140 });
  });
});

describe("buildReceiptUpdatePayload", () => {
  it("allows only descriptions and Werkbereich on paid receipts", () => {
    const paid = { ...expense, paymentStatus: "paid", payments: [{ amount: 3570 }] };
    const ok = buildReceiptUpdatePayload({
      receipt: paid,
      body: { receipt: { description: "Neu" }, positions: [{ description: "Bretter", costCenter2: 52 }] },
      fullyEditable: false,
      rateByCode,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.description).toBe("Neu");
      expect(ok.positions[0]).toMatchObject({ description: "Bretter", costCenter2: 52, amount: 3570 });
    }

    for (const body of [
      { positions: [{ description: "x", costCenter2: 51, amount: 1 }] },
      { receipt: { dueDate: "2026-12-01" } },
      { positions: [] as never[], receipt: { receiptNumber: "B-2" } },
      { positions: [{ description: "a" }, { description: "b" }] },
    ]) {
      const result = buildReceiptUpdatePayload({ receipt: paid, body, fullyEditable: false, rateByCode });
      expect(result.ok).toBe(false);
    }
  });

  it("rebuilds positions and recalculates the gross total on unpaid receipts", () => {
    const result = buildReceiptUpdatePayload({
      receipt: expense,
      body: {
        receipt: { receiptNumber: " B-9 ", dueDate: "2026-12-01", isNet: true },
        positions: [
          { account: 4900, taxCode: "VS19", amount: 1000, costCenter1: 3, costCenter2: 51, description: "Holz" },
          { account: 4900, taxCode: "VS19", amount: 2000, costCenter1: 3, costCenter2: null, description: "Schrauben" },
        ],
      },
      fullyEditable: true,
      rateByCode,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({ receiptNumber: "B-9", dueDate: "2026-12-01", isNet: true, totalGrossAmount: 3570 });
    expect(result.positions).toHaveLength(2);
  });

  it("rejects new accounts, tax codes and invalid Sphären", () => {
    const base = { account: 4900, taxCode: "VS19", amount: 100, costCenter1: 3 };
    for (const patch of [
      { ...base, account: 1234 },
      { ...base, taxCode: "VS7" },
      { ...base, costCenter1: 5 },
      { ...base, amount: 1.5 },
    ]) {
      const result = buildReceiptUpdatePayload({ receipt: expense, body: { positions: [patch] }, fullyEditable: true, rateByCode });
      expect(result.ok).toBe(false);
    }
    expect(
      buildReceiptUpdatePayload({ receipt: expense, body: { positions: [] }, fullyEditable: true, rateByCode }).ok,
    ).toBe(false);
    expect(
      buildReceiptUpdatePayload({ receipt: expense, body: { receipt: { receiptDate: "19.10.2026" } }, fullyEditable: true, rateByCode }).ok,
    ).toBe(false);
  });
});

describe("receipt notes", () => {
  it("round-trips the author prefix and spots system events", () => {
    expect(parseReceiptNote(formatAuthoredNote("Vincent Schmidt", "Bitte prüfen"))).toEqual({
      kind: "comment",
      author: "Vincent Schmidt",
      text: "Bitte prüfen",
    });
    expect(parseReceiptNote("Erstellt von Robert (r@x.org) via KongloDigital").kind).toBe("system");
    expect(parseReceiptNote("Status: offen").kind).toBe("system");
    expect(parseReceiptNote("Teil der Förderung\nStatus: offen")).toEqual({
      kind: "comment",
      author: null,
      text: "Teil der Förderung\nStatus: offen",
    });
  });
});

describe("euro input", async () => {
  const { centsToEuroInput, euroInputToCents } = await import("./euro-input");
  it("converts both ways", () => {
    expect(centsToEuroInput(3570)).toBe("35,70");
    expect(euroInputToCents("35,7")).toBe(3570);
    expect(euroInputToCents("0")).toBe(0);
    expect(euroInputToCents("1.234")).toBeNull();
    expect(euroInputToCents("")).toBeNull();
  });
});
