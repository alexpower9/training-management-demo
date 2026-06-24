import { todayDate } from './dates';

export const EXPIRING_WARNING_DAYS = 45;

const MS_PER_DAY = 86400000;

function parseDateOnly(dateString) {
  return dateString ? new Date(`${dateString}T00:00:00.000Z`) : null;
}

export function daysUntilExpiry(completion, asOf = todayDate()) {
  const expiresOn = parseDateOnly(completion?.expiresOn);
  const asOfDate = parseDateOnly(asOf);
  if (!expiresOn || !asOfDate) return null;

  return Math.ceil((expiresOn.getTime() - asOfDate.getTime()) / MS_PER_DAY);
}

export function completionStatus(completion, asOf) {
  const remainingDays = daysUntilExpiry(completion, asOf);

  if (remainingDays !== null && remainingDays < 0) return 'overdue';
  if (remainingDays !== null && remainingDays <= EXPIRING_WARNING_DAYS) {
    return 'expiring';
  }
  return 'compliant';
}
