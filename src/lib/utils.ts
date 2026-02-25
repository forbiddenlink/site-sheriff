/**
 * Shared utility functions for Site Sheriff
 */

/**
 * Format a date string as a relative time (e.g., "5m ago", "3h ago").
 * Handles both UTC (with Z suffix) and bare ISO date strings.
 */
export function timeAgo(dateString: string): string {
  const utcDate =
    dateString.endsWith('Z') || dateString.includes('+')
      ? dateString
      : dateString + 'Z';
  const seconds = Math.floor(
    (Date.now() - new Date(utcDate).getTime()) / 1000,
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
