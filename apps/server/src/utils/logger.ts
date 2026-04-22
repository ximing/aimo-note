import { getConfig } from '../config/config.js';

/**
 * Logger utility for consistent logging across the server
 * Uses JSON format for structured logging in production
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  deviceId?: string;
  userId?: string;
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const config = (() => {
    try {
      return getConfig();
    } catch {
      return { env: 'development' };
    }
  })();

  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
  };

  if (config.env === 'production') {
    return JSON.stringify(logEntry);
  }

  // Pretty print for development
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    console.debug(formatMessage('debug', message, context));
  },

  info(message: string, context?: LogContext): void {
    console.info(formatMessage('info', message, context));
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage('warn', message, context));
  },

  error(message: string, context?: LogContext): void {
    console.error(formatMessage('error', message, context));
  },
};
