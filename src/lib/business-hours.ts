/**
 * Pure "are we open right now?" evaluation for the public widget.
 *
 * Business hours and holidays are organization-level records. The only clock
 * that matters is the organization's own timezone (`organizations.timezone`);
 * website and department timezones are deliberately ignored here so the widget
 * cannot disagree with the admin UI.
 */
import { safeTimeZone, zonedParts } from "@/lib/org-time";

export type BusinessHourRow = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed?: boolean | null;
};

export type HolidayRow = { holiday_date: string };

function minutesOf(value: string): number | null {
  const [h, m] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * @param hours     organization business hours (day_of_week 0 = Sunday)
 * @param holidays  organization holidays, `holiday_date` as YYYY-MM-DD
 * @param timezone  organizations.timezone; anything invalid falls back safely
 */
export function isOpenNow(
  hours: BusinessHourRow[],
  holidays: HolidayRow[],
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const zone = safeTimeZone(timezone);
  const p = zonedParts(now, zone);
  const today = `${p.year}-${pad(p.month)}-${pad(p.day)}`;

  // A holiday closes the organization for the whole local day.
  if ((holidays ?? []).some((h) => String(h.holiday_date).slice(0, 10) === today)) return false;

  if (!hours?.length) return true;

  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const minutes = p.hour * 60 + p.minute;

  const inRange = (row: BusinessHourRow | undefined, wrappedFromYesterday: boolean): boolean => {
    if (!row || row.is_closed) return false;
    const open = minutesOf(row.open_time);
    const close = minutesOf(row.close_time);
    if (open === null || close === null) return false;
    if (close > open) return wrappedFromYesterday ? false : minutes >= open && minutes < close;
    // A range that ends at or before it starts runs past midnight (22:00–02:00).
    if (wrappedFromYesterday) return minutes < close;
    return minutes >= open || minutes < close;
  };

  const yesterday = (dow + 6) % 7;
  return (
    inRange(hours.find((h) => h.day_of_week === dow), false) ||
    inRange(hours.find((h) => h.day_of_week === yesterday), true)
  );
}
