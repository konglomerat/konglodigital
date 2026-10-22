import { describe, expect, it } from "vitest";

import {
  areaFilters,
  bookingAction,
  collapseSeries,
  formatDayMonth,
  formatTimeRange,
  listPriceCents,
  maxSeatsFor,
  normalizePhone,
  ratesFor,
  seatStatus,
  type WorkshopEvent,
} from "./workshops";

const event = (overrides: Partial<WorkshopEvent> = {}): WorkshopEvent => ({
  id: "e1",
  seriesId: null,
  seriesTotal: 1,
  title: "Löten",
  description: "",
  imageUrl: null,
  tags: [],
  area: "elektronik",
  start: "2026-10-25T12:00:00.000Z",
  end: "2026-10-25T14:30:00.000Z",
  placeName: null,
  placeAddress: null,
  maxAttendees: 6,
  minAttendees: null,
  taken: 2,
  free: 4,
  seatsThreshold: 10,
  waitlistEnabled: true,
  bookingOpen: true,
  bookingOpensAt: null,
  attendeeMode: "multiple",
  rates: [],
  paymentMethods: [],
  paymentNotes: {},
  paymentDueDays: null,
  addressMode: "none",
  requirePhone: false,
  infoBlocks: [],
  refundText: "",
  refundPolicies: [],
  ...overrides,
});

describe("normalizePhone", () => {
  it("rechnet deutsche Schreibweisen ins internationale Format um", () => {
    expect(normalizePhone("0351 123 456")).toBe("+49351123456");
    expect(normalizePhone("0049 176/1234-5678")).toBe("+4917612345678");
    expect(normalizePhone("+49 (351) 123456")).toBe("+49351123456");
  });

  it("lehnt Unsinn ab", () => {
    expect(normalizePhone("abc")).toBe("");
    expect(normalizePhone("12")).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});

describe("Formatierung in Dresdner Zeit", () => {
  it("zeigt Datum und Uhrzeit ohne doppelte Punkte oder NaN", () => {
    expect(formatDayMonth("2026-10-25T12:00:00.000Z")).toBe("25.10.");
    expect(
      formatTimeRange("2026-10-25T12:00:00.000Z", "2026-10-25T14:30:00.000Z"),
    ).toBe("13–15:30 Uhr");
  });
});

describe("Plätze und Status", () => {
  it("zeigt ausgebuchte Termine mit Warteliste", () => {
    const full = event({ free: 0, taken: 6 });
    expect(bookingAction(full)).toBe("waitlist");
    expect(seatStatus(full).label).toBe("Warteliste");
    expect(maxSeatsFor(full)).toBe(10);
  });

  it("begrenzt Plätze auf die freien und auf eine Person im Einzelmodus", () => {
    expect(maxSeatsFor(event({ free: 3 }))).toBe(3);
    expect(maxSeatsFor(event({ attendeeMode: "single" }))).toBe(1);
  });

  it("schließt ausgebuchte Termine ohne Warteliste", () => {
    expect(bookingAction(event({ free: 0, waitlistEnabled: false }))).toBe("closed");
  });
});

describe("Tarife", () => {
  const rates = [
    { id: "a", name: "Normal", description: "", priceCents: 4500, memberOnly: false, standard: true },
    { id: "b", name: "Mitglieder", description: "", priceCents: 3000, memberOnly: true, standard: false },
  ];

  it("versteckt Mitgliedertarife für Gäste", () => {
    expect(ratesFor(event({ rates }), false).map((rate) => rate.id)).toEqual(["a"]);
    expect(ratesFor(event({ rates }), true)).toHaveLength(2);
  });

  it("zeigt auf der Karte den regulären Preis", () => {
    expect(listPriceCents(event({ rates }))).toBe(4500);
    expect(listPriceCents(event())).toBeNull();
  });
});

describe("Serien und Filter", () => {
  it("fasst eine Reihe zu einer Karte mit dem nächsten Termin zusammen", () => {
    const entries = collapseSeries([
      event({ id: "s1", seriesId: "s", start: "2026-11-01T10:00:00.000Z" }),
      event({ id: "x", start: "2026-11-02T10:00:00.000Z" }),
      event({ id: "s2", seriesId: "s", start: "2026-11-15T10:00:00.000Z" }),
    ]);
    expect(entries.map((entry) => [entry.event.id, entry.moreDates])).toEqual([
      ["s1", 1],
      ["x", 0],
    ]);
  });

  it("überspringt volle Termine einer Reihe", () => {
    const entries = collapseSeries([
      event({ id: "s1", seriesId: "s", free: 0, waitlistEnabled: false }),
      event({ id: "s2", seriesId: "s", start: "2026-11-15T10:00:00.000Z" }),
    ]);
    expect(entries[0].event.id).toBe("s2");
  });

  it("baut Filter in Werkbereich-Reihenfolge, Sonstiges zuletzt", () => {
    const filters = areaFilters([
      event({ area: null }),
      event({ area: "elektronik" }),
      event({ area: "holz" }),
    ]);
    expect(filters.map((filter) => filter.value)).toEqual([
      "holz",
      "elektronik",
      "sonstiges",
    ]);
  });
});
