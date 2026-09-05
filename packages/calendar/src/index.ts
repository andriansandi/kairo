import { OrgCalendar, IsoDate, WeekKey } from "@kairo/types";

const DAY_MS = 86_400_000;

function parseDate(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): IsoDate {
  const year = String(d.getUTCFullYear()).padStart(4, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: IsoDate, n: number): IsoDate {
  const d = parseDate(date);
  d.setTime(d.getTime() + n * DAY_MS);
  return formatDate(d);
}

function dayOfWeek(date: IsoDate): number {
  return parseDate(date).getUTCDay();
}

/**
 * Return true if the date is a working day according to the calendar.
 */
export function isWorkingDay(date: IsoDate, calendar: OrgCalendar): boolean {
  const dow = dayOfWeek(date);
  if (!calendar.workingDays.includes(dow)) return false;
  if (calendar.holidays.includes(date)) return false;
  return true;
}

/**
 * Count working days in the half-open range [startIncl, endExcl).
 */
export function workingDaysBetween(
  startIncl: IsoDate,
  endExcl: IsoDate,
  calendar: OrgCalendar,
): number {
  let count = 0;
  let current = startIncl;
  while (current < endExcl) {
    if (isWorkingDay(current, calendar)) count++;
    current = addDays(current, 1);
  }
  return count;
}

/**
 * Return the given date if it is a working day, otherwise the next working day.
 */
export function nextWorkingDay(
  date: IsoDate,
  calendar: OrgCalendar,
): IsoDate {
  let current = date;
  while (!isWorkingDay(current, calendar)) {
    current = addDays(current, 1);
  }
  return current;
}

/**
 * Add `n` working days to `date` (count starts the day after `date`).
 * `n` must be non-negative.
 */
export function addWorkingDays(
  date: IsoDate,
  n: number,
  calendar: OrgCalendar,
): IsoDate {
  if (n < 0) throw new Error("addWorkingDays does not support negative n");
  if (n === 0) return date;
  let current = date;
  let count = 0;
  while (count < n) {
    current = addDays(current, 1);
    if (isWorkingDay(current, calendar)) count++;
  }
  return current;
}

/**
 * Return the Monday of the ISO week containing `date`.
 */
export function weekStart(date: IsoDate): IsoDate {
  const d = parseDate(date);
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setTime(d.getTime() + offset * DAY_MS);
  return formatDate(d);
}

/**
 * ISO week key: "YYYY-WNN".
 */
export function isoWeekKey(date: IsoDate): WeekKey {
  const d = parseDate(date);
  const thu = new Date(d.getTime());
  thu.setUTCDate(thu.getUTCDate() + 4 - ((thu.getUTCDay() || 7) as number));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const days = Math.floor((thu.getTime() - yearStart.getTime()) / DAY_MS) + 1;
  const week = Math.ceil(days / 7);
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Convenience: map an extra holiday into a new calendar.
 */
export function withHoliday(
  calendar: OrgCalendar,
  date: IsoDate,
): OrgCalendar {
  return { ...calendar, holidays: [...calendar.holidays, date] };
}
