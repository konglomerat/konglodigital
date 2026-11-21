import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));

import { buildCampaiBookingPayload, normalizeCampaiEvent } from "./campai-events";

const NOW = Date.parse("2026-10-22T12:00:00.000Z");

const campaiEvent = (bookingRestriction: string, maxAttendees: number | null = null) => ({
  _id: "6ad9eb60659dc991a41563e1",
  info: { title: "CNC Workshop 1: CAD" },
  settings: { maxAttendees },
  statistics: { confirmed: 0, pending: 0, offered: 0 },
  offer: {
    mode: "public",
    bookingRestriction,
    rates: [{ id: "normal", name: "Normal", standard: true, charge: { price: { price: 4500 } } }],
    paymentMethods: { sepaCreditTransfer: {} },
  },
  period: { from: "2030-01-01T09:00:00.000Z", to: "2030-01-01T13:00:00.000Z" },
});

const input = {
  rateId: "normal",
  seats: 2,
  applicant: { name: "Kim Muster", email: "kim@example.org", phone: "" },
  attendeeNames: ["Kim Muster", "Alex Muster"],
  address: null,
  paymentMethod: null,
  contactId: null,
  membershipNumber: null,
  isMember: false,
};

describe("Termin offen („Bestätigung erforderlich“)", () => {
  it("erkennt den offenen Termin an bookingRestriction", () => {
    expect(normalizeCampaiEvent(campaiEvent("requireConfirmation"), NOW).dateOpen).toBe(true);
    expect(normalizeCampaiEvent(campaiEvent("bookIntoWaitlist"), NOW).dateOpen).toBe(false);
  });

  it("bucht auf die Warteliste: ohne Zahlart, auch bei unbegrenzten Plätzen", () => {
    const event = normalizeCampaiEvent(campaiEvent("requireConfirmation"), NOW);
    const payload = buildCampaiBookingPayload(event, input);
    expect(payload.buyer).not.toHaveProperty("payment");
    expect(payload.attendees).toHaveLength(2);
  });

  it("nimmt bei geschützten Terminen keine Buchung an", () => {
    const raw = campaiEvent("bookIntoWaitlist", 6);
    const event = normalizeCampaiEvent({ ...raw, offer: { ...raw.offer, mode: "protected" } }, NOW);
    expect(event.published).toBe(false);
    expect(event.bookingOpen).toBe(false);
    expect(() => buildCampaiBookingPayload(event, input)).toThrow(/geschlossen/);
  });

  it("verlangt bei normalem Termin mit freien Plätzen weiter eine Zahlart", () => {
    const event = normalizeCampaiEvent(campaiEvent("bookIntoWaitlist", 6), NOW);
    expect(() => buildCampaiBookingPayload(event, input)).toThrow(/bezahlen/);
  });
});
