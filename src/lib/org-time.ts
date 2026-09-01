/**
 * Tenant-timezone-aware period maths.
 *
 * "Today", "This week" and "This month" must mean what they mean in the
 * organization's own timezone (`organizations.timezone`, an IANA name such as
 * `America/Los_Angeles`), not in UTC and not in the browser's timezone. These
 * helpers are pure and dependency-free so the same code runs in the browser,
 * in server functions, and in the test suite. Daylight saving is handled by
 * resolving each wall-clock instant against the zone's real offset.
 */

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    cache.set(timeZone, f);
  }
  return f;
}

/** Is this a timezone the runtime actually knows about? */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** Wall-clock fields of an instant, as seen in the given zone. */
export function zonedParts(date: Date, timeZone: string): Parts {
  const bag: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    year: Number(bag['year']),
    month: Number(bag['month']),
    day: Number(bag['day']),
    hour: Number(bag['hour']),
    minute: Number(bag['minute']),
    second: Number(bag['second']),
  };
}

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetMs(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (utcMs - (utcMs % 1000));
}

/**
 * Turn a wall-clock time in a zone into the matching UTC instant.
 * Two passes settle the DST boundary case where the first guess lands on the
 * other side of a clock change.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  let utc = naive - offsetMs(naive, timeZone);
  utc = naive - offsetMs(utc, timeZone);
  return new Date(utc);
}

/** Midnight, in the org's zone, of the day containing `date`. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** Midnight of the Monday starting the week that contains `date`. */
export function startOfWeekInZone(date: Date, timeZone: string): Date {
  const dayStart = startOfDayInZone(date, timeZone);
  // Weekday is read back in the zone so the shift is calendar-correct.
  const weekday = new Date(
    Date.UTC(
      zonedParts(dayStart, timeZone).year,
      zonedParts(dayStart, timeZone).month - 1,
      zonedParts(dayStart, timeZone).day,
    ),
  ).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const p = zonedParts(dayStart, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day - mondayOffset }, timeZone);
}

export function startOfMonthInZone(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: 1 }, timeZone);
}

/** Shift by whole calendar days in the zone (DST-safe: never 23h/25h drift). */
export function addDaysInZone(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.day + days, hour: p.hour, minute: p.minute, second: p.second },
    timeZone,
  );
}

export const PERIODS = ["today", "week", "last7", "month", "last30"] as const;
export type Period = (typeof PERIODS)[number];

export type Window = { from: string; to: string; prevFrom: string; prevTo: string };

/** Current and comparison window for a named period, in the org's timezone. */
export function periodWindow(period: Period, timeZone: string, now: Date = new Date()): Window {
  const tz = safeTimeZone(timeZone);
  let start: Date;
  switch (period) {
    case "today":
      start = startOfDayInZone(now, tz);
      break;
    case "week":
      start = startOfWeekInZone(now, tz);
      break;
    case "month":
      start = startOfMonthInZone(now, tz);
      break;
    case "last7":
      start = addDaysInZone(now, -7, tz);
      break;
    case "last30":
      start = addDaysInZone(now, -30, tz);
      break;
  }
  const span = now.getTime() - start.getTime();
  return {
    from: start.toISOString(),
    to: now.toISOString(),
    prevFrom: new Date(start.getTime() - span).toISOString(),
    prevTo: start.toISOString(),
  };
}

/** Rolling "last N days" window anchored on the org's midnight boundary. */
export function lastDaysWindow(days: number, timeZone: string, now: Date = new Date()): { from: string; to: string } {
  const tz = safeTimeZone(timeZone);
  const to = now;
  const from = days <= 1 ? startOfDayInZone(now, tz) : addDaysInZone(startOfDayInZone(now, tz), -(days - 1), tz);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Inclusive `YYYY-MM-DD` range picked by a user, read in the org's timezone. */
export function dateRangeInZone(fromDate: string, toDate: string, timeZone: string): { from: string; to: string } {
  const tz = safeTimeZone(timeZone);
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = zonedTimeToUtc({ year: fy!, month: fm!, day: fd! }, tz);
  // Exclusive upper bound: midnight of the day after the chosen end date.
  const to = zonedTimeToUtc({ year: ty!, month: tm!, day: td! + 1 }, tz);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Format an instant for display in the org's timezone. */
export function formatInZone(value: string | number | Date | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
