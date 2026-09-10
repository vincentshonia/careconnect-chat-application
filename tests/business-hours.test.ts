import { describe, expect, it } from "vitest";
import { isOpenNow, type BusinessHourRow } from "@/lib/business-hours";

const TZ = "America/Los_Angeles";

/** 2026-09-10 is a Thursday (day_of_week 4) in Los Angeles. */
function laInstant(iso: string) {
  return new Date(iso);
}

describe("isOpenNow", () => {
  it("treats a range that runs past midnight as open at 00:00", () => {
    // Thursday 22:00 -> 02:00 in Los Angeles; the instant below is Friday 00:00 LA.
    const hours: BusinessHourRow[] = [
      { day_of_week: 4, open_time: "22:00:00", close_time: "02:00:00", is_closed: false },
    ];
    const midnight = laInstant("2026-09-11T07:00:00Z"); // Fri 00:00 LA
    expect(isOpenNow(hours, [], TZ, midnight)).toBe(true);

    // Same wrapping range, evaluated on its own evening.
    const evening = laInstant("2026-09-10T05:30:00Z"); // Wed 22:30 LA -> outside Thursday row
    expect(isOpenNow(hours, [], TZ, evening)).toBe(false);
    const thursdayEvening = laInstant("2026-09-11T05:30:00Z"); // Thu 22:30 LA
    expect(isOpenNow(hours, [], TZ, thursdayEvening)).toBe(true);
  });

  it("stays closed on a holiday even inside business hours", () => {
    const hours: BusinessHourRow[] = [
      { day_of_week: 4, open_time: "09:00:00", close_time: "17:00:00", is_closed: false },
    ];
    const during = laInstant("2026-09-10T19:00:00Z"); // Thu 12:00 LA
    expect(isOpenNow(hours, [], TZ, during)).toBe(true);
    expect(isOpenNow(hours, [{ holiday_date: "2026-09-10" }], TZ, during)).toBe(false);
    // A holiday on another day changes nothing.
    expect(isOpenNow(hours, [{ holiday_date: "2026-09-11" }], TZ, during)).toBe(true);
  });

  it("does not throw on an invalid timezone string", () => {
    const hours: BusinessHourRow[] = [
      { day_of_week: 0, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 1, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 2, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 3, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 4, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 5, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
      { day_of_week: 6, open_time: "00:00:00", close_time: "23:59:00", is_closed: false },
    ];
    expect(() => isOpenNow(hours, [], "Not/AZone")).not.toThrow();
    expect(isOpenNow(hours, [], "Not/AZone", laInstant("2026-09-10T19:00:00Z"))).toBe(true);
    expect(() => isOpenNow(hours, [], null)).not.toThrow();
  });

  it("is open when no hours are configured and closed on days marked closed", () => {
    expect(isOpenNow([], [], TZ)).toBe(true);
    const closed: BusinessHourRow[] = [
      { day_of_week: 4, open_time: "09:00:00", close_time: "17:00:00", is_closed: true },
    ];
    expect(isOpenNow(closed, [], TZ, laInstant("2026-09-10T19:00:00Z"))).toBe(false);
  });
});
