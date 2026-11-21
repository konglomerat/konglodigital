import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/app/[lang]/calendar/calendar-data";
import { calendarEventMatchesWerkbereich, filterWerkbereichEvents } from "./werkbereich-calendar";

const event = (summary: string, description = ""): CalendarEvent => ({
  id: summary, summary, description, start: new Date("2026-11-25T17:00:00Z"), allDay: false,
});

describe("Werkbereich calendar", () => {
  it("uses exact area tags, including HTML descriptions and textile aliases", () => {
    expect(calendarEventMatchesWerkbereich(event("Offene Werkstatt", "<p>#SiEbDrUcK</p>"), "siebdruck")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Offene Werkstatt", "#Textiles"), "textil")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Offene Werkstatt", "#Laserbau"), "laser")).toBe(false);
  });

  it("does not assign unrelated projects in the description to Laser or 3D", () => {
    const electronics = event("öffentliches Elektroniktreffen", "Aktuelles Projekt: Laserbau & 3D Drucker #Offene_WS #Elektronik");
    expect(calendarEventMatchesWerkbereich(electronics, "elektronik")).toBe(true);
    expect(calendarEventMatchesWerkbereich(electronics, "laser")).toBe(false);
    expect(calendarEventMatchesWerkbereich(electronics, "3d-druck")).toBe(false);
  });

  it("shares the open Laser workshop with 3D, without sharing every Laser event", () => {
    expect(calendarEventMatchesWerkbereich(event("offene Laserwerkstatt", "#Laser #Offene_WS"), "3d-druck")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Laser-Einweisung", "#Laser"), "3d-druck")).toBe(false);
  });

  it("keeps VHC events at VHC even when their title mentions 3D printing", () => {
    const nvc = event("3D-Druck im NVC", "#VHC");
    expect(calendarEventMatchesWerkbereich(nvc, "3d-druck")).toBe(false);
    expect(calendarEventMatchesWerkbereich(nvc, "vhc")).toBe(true);
  });

  it("recognizes precise titles when area tags are absent", () => {
    expect(calendarEventMatchesWerkbereich(event("Offene 3D‑Druck Werkstatt"), "3d-druck")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Einführung 3D Druck"), "3d-druck")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Offene Holzwerkstatt", "#Offene_WS"), "holz")).toBe(true);
    expect(calendarEventMatchesWerkbereich(event("Lasertag im Park"), "laser")).toBe(false);
  });

  it("filters the complete event list before callers apply their display limit", () => {
    const events = [...Array.from({ length: 8 }, (_, i) => event(`Yoga ${i}`, "#VHC")), event("offene Holzwerkstatt", "#Holz")];
    expect(filterWerkbereichEvents(events, "holz").slice(0, 6)).toEqual([events[8]]);
    expect(filterWerkbereichEvents(events)).toBe(events);
  });

  it("does not fall back to unrelated events for empty or unknown areas", () => {
    const events = [event("Yogatreff", "#VHC"), event("Intro", "#Intro #Rosenwerk")];
    expect(filterWerkbereichEvents(events, "beton")).toEqual([]);
    expect(filterWerkbereichEvents(events, "new-area")).toEqual([]);
    expect(filterWerkbereichEvents([event("Werkstatt", "#new-area")], "new-area")).toHaveLength(1);
  });
});
