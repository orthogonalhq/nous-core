/**
 * LogChannel — ILogChannel implementation for a single namespace.
 *
 * Channels short-circuit before LogEntry construction when disabled,
 * keeping the hot path effectively free.
 */
import type { LogEntry, LogLevel } from '@nous/shared';
import type { ILogChannel, ILogEgress } from '@nous/shared';

export class LogChannel implements ILogChannel {
  private _enabled = true;
  private readonly _namespace: string;
  private readonly _getLevel: () => LogLevel;
  private readonly _getEgresses: () => readonly EgressSlot[];

  constructor(
    namespace: string,
    getLevel: () => LogLevel,
    getEgresses: () => readonly EgressSlot[],
  ) {
    this._namespace = namespace;
    this._getLevel = getLevel;
    this._getEgresses = getEgresses;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this._emit(0 /* LogLevel.Debug */, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this._emit(1 /* LogLevel.Info */, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this._emit(2 /* LogLevel.Warn */, message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this._emit(3 /* LogLevel.Error */, message, data);
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  /** @internal — called by NousLogger when config changes */
  _setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  private _emit(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (!this._enabled) return;
    if (level < this._getLevel()) return;

    const entry: LogEntry = {
      level,
      namespace: this._namespace,
      message,
      data,
      timestamp: Date.now(),
    };

    const egresses = this._getEgresses();
    for (let i = 0; i < egresses.length; i++) {
      const slot = egresses[i];
      if (!slot.active) continue;
      try {
        slot.egress.write(entry);
        slot.consecutiveFailures = 0;
      } catch {
        slot.consecutiveFailures++;
        if (slot.consecutiveFailures >= 5) {
          slot.active = false;
          // eslint-disable-next-line no-console
          console.warn(
            `[nous:logger] Egress "${slot.egress.name}" auto-disabled after 5 consecutive failures`,
          );
        }
      }
    }
  }
}

/**
 * Internal egress tracking structure.
 * Exported for use by NousLogger — not part of the public API.
 */
export interface EgressSlot {
  egress: ILogEgress;
  active: boolean;
  consecutiveFailures: number;
}
