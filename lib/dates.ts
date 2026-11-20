// Utility functions for handling Wednesday dates in Europe/Prague timezone

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Parses YYYY-MM-DD into a Date set to 12:00 UTC so timezone offsets never shift the calendar day.
 */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function getTodayCzechString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

// Get current date/time in Czech timezone
export function getCurrentCzechTime(): Date {
  return parseDateString(getTodayCzechString());
}

export function formatDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

export function formatDateCzech(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('cs-CZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Prague',
  });
}

export function formatDateCzechFromString(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr;
  return formatDateCzech(parseDateString(dateStr));
}

export function formatDateCzechShort(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr;
  return parseDateString(dateStr).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  });
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const dt = parseDateString(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDate(dt);
}

export function isWednesdayString(dateStr: string): boolean {
  if (!isValidDateString(dateStr)) return false;
  return parseDateString(dateStr).getUTCDay() === 3;
}

/**
 * Given any YYYY-MM-DD date, returns the Wednesday of that same week (Mon-Sun)
 * or the exact date if it's already a Wednesday.
 */
export function snapToWednesday(dateStr: string): string {
  if (!isValidDateString(dateStr)) return getCurrentWednesdayString();
  const dt = parseDateString(dateStr);
  const day = dt.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const diff = day === 0 ? -4 : 3 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return formatDate(dt);
}

export function getCurrentWednesdayString(): string {
  const todayStr = getTodayCzechString();
  const dt = parseDateString(todayStr);
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilWed = (3 - day + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() + daysUntilWed);
  return formatDate(dt);
}

export function getWednesdaysRangeStrings(
  pastWeeks: number = 4,
  futureWeeks: number = 4
): string[] {
  const currentWed = getCurrentWednesdayString();
  const dates: string[] = [];
  for (let i = -pastWeeks; i < futureWeeks; i++) {
    dates.push(addDaysToDateString(currentWed, i * 7));
  }
  return dates;
}

export function getWednesdaysBetween(startDate: string, endDate: string): string[] {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) return [];
  if (startDate > endDate) return [];

  const dt = parseDateString(startDate);
  const day = dt.getUTCDay();
  const daysUntilWed = (3 - day + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() + daysUntilWed);

  const result: string[] = [];
  let cursor = formatDate(dt);
  // Guard against accidental massive ranges (max ~20 years)
  let safety = 0;
  while (cursor <= endDate && safety < 1100) {
    result.push(cursor);
    dt.setUTCDate(dt.getUTCDate() + 7);
    cursor = formatDate(dt);
    safety++;
  }
  return result;
}

export function isDateStringInPast(dateStr: string): boolean {
  if (!isValidDateString(dateStr)) return false;
  return dateStr < getTodayCzechString();
}

export function isDateStringToday(dateStr: string): boolean {
  if (!isValidDateString(dateStr)) return false;
  return dateStr === getTodayCzechString();
}

// Legacy Date-based helpers kept for compatibility
export function isDateInPast(date: Date): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
  return formatDate(date) < getTodayCzechString();
}

export function isDateToday(date: Date): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
  return formatDate(date) === getTodayCzechString();
}
