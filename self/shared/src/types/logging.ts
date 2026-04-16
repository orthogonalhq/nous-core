/**
 * Logging types for the structured logging facade.
 *
 * These types define the contract between the logger package
 * (@nous/autonomic-logger) and the rest of the system.
 */

/**
 * Severity levels for log entries, ordered by increasing severity.
 * Numeric values enable comparison: `level >= LogLevel.Warn`.
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

/**
 * A single structured log entry emitted by a channel.
 */
export interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}
