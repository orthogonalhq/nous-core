/**
 * ConsoleEgress — maps LogLevel to console methods.
 *
 * Format: `[nous:<ns>] message { data }`
 */
import { LogLevel } from '@nous/shared';
import type { LogEntry, ILogEgress } from '@nous/shared';

export class ConsoleEgress implements ILogEgress {
  readonly name = 'console';

  write(entry: LogEntry): void {
    const prefix = `[${entry.namespace}]`;
    const suffix =
      entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
    const message = `${prefix} ${entry.message}${suffix}`;

    switch (entry.level) {
      case LogLevel.Debug:
        // eslint-disable-next-line no-console
        console.debug(message);
        break;
      case LogLevel.Info:
        // eslint-disable-next-line no-console
        console.info(message);
        break;
      case LogLevel.Warn:
        // eslint-disable-next-line no-console
        console.warn(message);
        break;
      case LogLevel.Error:
        // eslint-disable-next-line no-console
        console.error(message);
        break;
    }
  }
}
