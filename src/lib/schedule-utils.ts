import type { ScheduleFrequency } from './types';

/**
 * Calculate the next run time based on frequency.
 *
 * - DAILY: Next day at 6:00 AM UTC
 * - WEEKLY: Next Monday at 6:00 AM UTC
 * - MONTHLY: 1st of next month at 6:00 AM UTC
 */
export function calculateNextRunAt(frequency: ScheduleFrequency, from: Date = new Date()): Date {
  const next = new Date(from);

  // Reset to 6:00 AM UTC
  next.setUTCHours(6, 0, 0, 0);

  switch (frequency) {
    case 'DAILY':
      // If already past 6 AM today, schedule for tomorrow
      if (from.getTime() >= next.getTime()) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case 'WEEKLY':
      // Schedule for next Monday at 6 AM UTC
      const daysUntilMonday = (8 - next.getUTCDay()) % 7 || 7;
      next.setUTCDate(next.getUTCDate() + daysUntilMonday);
      break;

    case 'MONTHLY':
      // Schedule for 1st of next month at 6 AM UTC
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(1);
      break;
  }

  return next;
}

/**
 * Calculate the next run time after a completed scan.
 */
export function calculateNextRunAfterCompletion(frequency: ScheduleFrequency): Date {
  return calculateNextRunAt(frequency);
}
