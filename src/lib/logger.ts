/**
 * Structured logging utility for Site Sheriff
 *
 * Provides consistent log formatting with levels, timestamps, and context.
 * In production, these logs appear in Vercel's function logs and can be
 * filtered/searched by level and context fields.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Scan started', { scanId: '123', url: 'example.com' });
 *   logger.warn('Fallback activated', { reason: 'timeout', phase: 'seo' });
 *   logger.error('Scan failed', { error: err.message, scanId: '123' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

function formatLog(entry: LogEntry): string {
  const base = `[${entry.level.toUpperCase()}] ${entry.message}`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    return `${base} ${JSON.stringify(entry.context)}`;
  }
  return base;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };

  const formatted = formatLog(entry);

  switch (level) {
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(formatted);
      }
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};
