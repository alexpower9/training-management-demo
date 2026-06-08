export function addCalendarMonths(dateString, months) {
  if (!dateString || !months) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + Number(months), 1));
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return [
    targetMonthStart.getUTCFullYear(),
    String(targetMonthStart.getUTCMonth() + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-');
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
