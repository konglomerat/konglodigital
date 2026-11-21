import { describe, expect, it } from "vitest";

import {
  bookingAction,
  cardPrice,
  categoryFilters,
  collapseSeries,
  formatDayMonth,
  formatTimeRange,
  isDateFarOff,
  isSoldOut,
  listPriceCents,
  matchesCategory,
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
  categories: [],
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
  dateOpen: false,
  published: true,
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

  it("schickt bei offenem Termin immer auf die Warteliste", () => {
    for (const open of [
      event({ dateOpen: true, waitlistEnabled: false }),
      event({ dateOpen: true, maxAttendees: null, free: null, taken: 0 }),
    ]) {
      expect(bookingAction(open)).toBe("waitlist");
      expect(seatStatus(open).label).toBe("Termin offen – nur Warteliste");
      expect(maxSeatsFor(open)).toBe(10);
      expect(isSoldOut(open)).toBe(false);
    }
  });

  it("erkennt Platzhalter-Termine mehr als ein Jahr in der Zukunft", () => {
    const now = Date.parse("2026-10-22T12:00:00.000Z");
    expect(isDateFarOff(event({ start: "2028-01-01T09:00:00.000Z" }), now)).toBe(true);
    expect(isDateFarOff(event({ start: "2027-10-22T13:00:00.000Z" }), now)).toBe(true);
    expect(isDateFarOff(event({ start: "2027-10-22T11:00:00.000Z" }), now)).toBe(false);
    expect(isDateFarOff(event({ start: "2027-01-01T09:00:00.000Z" }), now)).toBe(false);
    expect(isDateFarOff(event({ start: "" }), now)).toBe(false);
  });

  it("zeigt geschützte Termine als nicht buchbar", () => {
    const preview = event({ published: false, bookingOpen: false, dateOpen: true });
    expect(seatStatus(preview).label).toBe("Noch nicht buchbar");
    expect(bookingAction(preview)).toBe("closed");
  });

  it("zeigt geschlossene Anmeldung auch bei offenem Termin", () => {
    const closed = event({ dateOpen: true, bookingOpen: false });
    expect(bookingAction(closed)).toBe("closed");
    expect(seatStatus(closed).label).toBe("Anmeldung geschlossen");
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

  it("zeigt bei mehreren Preisen den niedrigsten mit „ab“", () => {
    const two = [
      { id: "n", name: "Normal", description: "", priceCents: 6500, memberOnly: false, standard: true },
      { id: "m", name: "Ermäßigt", description: "", priceCents: 4500, memberOnly: false, standard: false },
    ];
    expect(cardPrice(event({ rates: two }))).toEqual({ cents: 4500, from: true });
    expect(cardPrice(event({ rates: [two[0]] }))).toEqual({ cents: 6500, from: false });
    expect(cardPrice(event({ rates: [two[0], { ...two[1], priceCents: 6500 }] }))).toEqual({
      cents: 6500,
      from: false,
    });
    expect(cardPrice(event({ rates: [two[0], { ...two[1], priceCents: null }] }))).toEqual({
      cents: 0,
      from: true,
    });
    expect(cardPrice(event())).toEqual({ cents: null, from: false });
  });

  it("zeigt den Mitgliederpreis, wenn es nur Mitgliedertarife gibt", () => {
    expect(listPriceCents(event({ rates: [rates[1]] }))).toBe(3000);
  });
});

describe("Serien und Filter", () => {
  it("sortiert öffentliche vor geschützten Terminen, darin nach Datum", () => {
    const entries = collapseSeries([
      event({ id: "geschuetzt-frueh", published: false, start: "2026-11-01T09:00:00.000Z" }),
      event({ id: "oeffentlich-spaet", start: "2027-03-01T09:00:00.000Z" }),
      event({ id: "geschuetzt-spaet", published: false, start: "2030-01-01T09:00:00.000Z" }),
      event({ id: "oeffentlich-offen", title: "Aquarell", dateOpen: true }),
      event({ id: "oeffentlich-frueh", start: "2026-11-02T09:00:00.000Z" }),
    ]);
    expect(entries.map((entry) => entry.event.id)).toEqual([
      "oeffentlich-frueh",
      "oeffentlich-spaet",
      "oeffentlich-offen",
      "geschuetzt-frueh",
      "geschuetzt-spaet",
    ]);
  });

  it("sortiert offene Termine nach den datierten, untereinander nach Titel", () => {
    const entries = collapseSeries([
      event({ id: "offen-z", title: "Zeichnen", dateOpen: true, start: "2027-01-01T09:00:00.000Z" }),
      event({ id: "spaet", start: "2028-01-01T09:00:00.000Z" }),
      event({ id: "offen-a", title: "Aquarell", dateOpen: true, start: "2026-11-01T09:00:00.000Z" }),
      event({ id: "frueh", start: "2026-11-02T09:00:00.000Z" }),
    ]);
    expect(entries.map((entry) => entry.event.id)).toEqual([
      "frueh",
      "spaet",
      "offen-a",
      "offen-z",
    ]);
  });

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

  const holz = { id: "c-holz", name: "Holzwerkstatt" };
  const cnc = { id: "c-cnc", name: "CNC-Werkstatt" };

  it("baut Filter aus den Campai-Kategorien, nach Name, Sonstiges zuletzt", () => {
    const filters = categoryFilters([
      event({ categories: [] }),
      event({ categories: [holz] }),
      event({ categories: [cnc, holz] }),
    ]);
    expect(filters.map((filter) => filter.label)).toEqual([
      "CNC-Werkstatt",
      "Holzwerkstatt",
      "Sonstiges",
    ]);
    expect(categoryFilters([event()])).toEqual([]);
  });

  it("filtert nach Kategorie und nach „ohne Kategorie“", () => {
    expect(matchesCategory(event({ categories: [cnc, holz] }), "c-holz")).toBe(true);
    expect(matchesCategory(event({ categories: [cnc] }), "c-holz")).toBe(false);
    expect(matchesCategory(event(), "sonstiges")).toBe(true);
  });
});
