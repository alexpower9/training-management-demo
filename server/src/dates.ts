const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string) {
  if (!datePattern.test(value)) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addCalendarMonths(dateString: string, months: number) {
  const source = parseDateOnly(dateString);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return formatDateOnly(
    new Date(
      Date.UTC(
        targetMonthStart.getUTCFullYear(),
        targetMonthStart.getUTCMonth(),
        Math.min(day, lastDay),
      ),
    ),
  );
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function todayInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function daysBetween(fromDate: string, toDate: string) {
  return Math.ceil(
    (parseDateOnly(toDate).getTime() - parseDateOnly(fromDate).getTime()) / 86400000,
  );
}
