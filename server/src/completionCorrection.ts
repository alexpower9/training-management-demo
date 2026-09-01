import { z } from 'zod';
import { formatDateOnly } from './dates.js';
import { AppError } from './errors.js';
import { dateOnlyString } from './routeUtils.js';

export const completionDateCorrectionInput = z
  .object({
    completedOn: dateOnlyString,
    expiresOn: dateOnlyString,
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.expiresOn < data.completedOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresOn'],
        message: 'Expiry date must be on or after the completion date.',
      });
    }
  });

export function ensureCompletionDatesChanged(
  source: { completedOn: Date; expiresOn: Date },
  replacement: { completedOn: string; expiresOn: string },
) {
  if (
    replacement.completedOn === formatDateOnly(source.completedOn) &&
    replacement.expiresOn === formatDateOnly(source.expiresOn)
  ) {
    throw new AppError(
      400,
      'COMPLETION_DATES_UNCHANGED',
      'At least one completion date must change.',
      {
        completedOn: ['Enter a different completion or expiry date.'],
        expiresOn: ['Enter a different completion or expiry date.'],
      },
    );
  }
}
