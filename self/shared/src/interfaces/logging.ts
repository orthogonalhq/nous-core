/**
 * Logging interface contracts for the structured logging facade.
 */
import type { LogEntry, LogLevel } from '../types/logging.js';
import type { IConfig } from './autonomic.js';

/**
 * A namespaced log channel. Each channel corresponds to a subsystem
 * (e.g. `nous:config`, `nous:gateway:auth`).
 *
 * Disabled channels short-circuit before LogEntry construction.
 */
export interface ILogChannel {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  isEnabled(): boolean;
}

/**
 * Egress plugin interface. Each egress receives every log entry
 * and decides how to persist or forward it.
 *
 * `write()` is synchronous, fire-and-forget. The logger wraps each
 * call in try/catch and auto-disables after 5 consecutive failures.
 */
export interface ILogEgress {
  readonly name: string;
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  dispose?(): Promise<void>;
}

/**
 * Top-level logger interface exposed to service graph consumers.
 */
export interface ILogger {
  channel(namespace: string): ILogChannel;
  bindConfig(config: IConfig): void;
  setLevel(level: LogLevel): void;
}
