import { describe, expect, it } from "vitest";
import {
  addDaysInZone,
  dateRangeInZone,
  lastDaysWindow,
  periodWindow,
  safeTimeZone,
  startOfDayInZone,
  startOfMonthInZone,
  startOfWeekInZone,
  zonedParts,
} from "@/lib/org-time";

const LA = "America/Los_Angeles";

describe("organization timezone maths", () => {
  it("falls back to the default zone for junk input", () => {
    expect(safeTimeZone("Not/AZone")).toBe(LA);
    expect(safeTimeZone(null)).toBe(LA);
    expect(safeTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
  });

  it("anchors 'today' on local midnight, not UTC midnight", () => {
    // 2026-03-10T04:00Z is still 2026-03-09 20:00 in Los Angeles.
    const start = startOfDayInZone(new Date("2026-03-10T04:00:00Z"), LA);
    const parts = zonedParts(start, LA);
    expect([parts.year, parts.month, parts.day]).toEqual([2026, 3, 9]);
    expect(parts.hour).toBe(0);
  });

  it("keeps a spring-forward day exactly one calendar day long", () => {
    // US DST begins 2026-03-08; that local day is only 23 hours.
    const dayStart = startOfDayInZone(new Date("2026-03-08T12:00:00Z"), LA);
    const next = addDaysInZone(dayStart, 1, LA);
    expect(zonedParts(next, LA).hour).toBe(0);
    expect(next.getTime() - dayStart.getTime()).toBe(23 * 3600_000);
  });

  it("keeps a fall-back day exactly one calendar day long", () => {
    // US DST ends 2026-11-01; that local day is 25 hours.
    const dayStart = startOfDayInZone(new Date("2026-11-01T12:00:00Z"), LA);
    const next = addDaysInZone(dayStart, 1, LA);
    expect(zonedParts(next, LA).hour).toBe(0);
    expect(next.getTime() - dayStart.getTime()).toBe(25 * 3600_000);
  });

  it("starts the week on local Monday midnight", () => {
    const start = startOfWeekInZone(new Date("2026-03-12T18:00:00Z"), LA);
    const p = zonedParts(start, LA);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2026, 3, 9, 0]);
  });

  it("starts the month on the local first", () => {
    const p = zonedParts(startOfMonthInZone(new Date("2026-03-12T18:00:00Z"), LA), LA);
    expect([p.month, p.day, p.hour]).toEqual([3, 1, 0]);
  });

  it("gives a comparison window of equal length", () => {
    const w = periodWindow("week", LA, new Date("2026-03-12T18:00:00Z"));
    const span = Date.parse(w.to) - Date.parse(w.from);
    expect(Date.parse(w.prevTo) - Date.parse(w.prevFrom)).toBe(span);
    expect(w.prevTo).toBe(w.from);
  });

  it("rolls 'last N days' back from local midnight, DST included", () => {
    const w = lastDaysWindow(7, LA, new Date("2026-03-12T18:00:00Z"));
    const p = zonedParts(new Date(w.from), LA);
    expect([p.month, p.day, p.hour]).toEqual([3, 6, 0]);
  });

  it("treats a picked date range as inclusive of the end day", () => {
    const r = dateRangeInZone("2026-03-01", "2026-03-31", LA);
    const from = zonedParts(new Date(r.from), LA);
    const to = zonedParts(new Date(r.to), LA);
    expect([from.month, from.day, from.hour]).toEqual([3, 1, 0]);
    // Exclusive upper bound: local midnight starting 1 April.
    expect([to.month, to.day, to.hour]).toEqual([4, 1, 0]);
  });

  it("reads the same instant differently in two tenant zones", () => {
    const instant = new Date("2026-03-10T04:00:00Z");
    expect(zonedParts(startOfDayInZone(instant, LA), LA).day).toBe(9);
    expect(zonedParts(startOfDayInZone(instant, "Europe/Berlin"), "Europe/Berlin").day).toBe(10);
  });
});
