import type { Weekday } from './types.js';

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const INDEX_WEEKDAY: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Parse YYYY-MM-DD as a UTC calendar date (no timezone shift). */
export function parseLocalDate(localDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  return date;
}

export function formatLocalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatLocalDate(date);
}

export function compareLocalDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isValidLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Week start for a local calendar date given the group's configured start weekday.
 * Returns YYYY-MM-DD of the first day of that week.
 */
export function weekStartDate(localDate: string, weekStartsOn: Weekday = 'monday'): string {
  const date = parseLocalDate(localDate);
  const dow = date.getUTCDay();
  const startIndex = WEEKDAY_INDEX[weekStartsOn];
  const delta = (dow - startIndex + 7) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return formatLocalDate(date);
}

export function weekEndDate(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function datesInWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isDateInWeek(localDate: string, weekStart: string): boolean {
  const end = weekEndDate(weekStart);
  return localDate >= weekStart && localDate <= end;
}

/** Today's YYYY-MM-DD in an IANA timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve local date for timezone ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}

export function weekdayOf(localDate: string): Weekday {
  const date = parseLocalDate(localDate);
  return INDEX_WEEKDAY[date.getUTCDay()]!;
}

export function isFutureLocalDate(localDate: string, today: string): boolean {
  return compareLocalDates(localDate, today) > 0;
}

export function previousWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, 7);
}

export function assertIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
