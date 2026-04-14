/**
 * NullEgress — discards all log entries.
 *
 * Useful for testing or environments where logging should be suppressed.
 */
import type { LogEntry, ILogEgress } from '@nous/shared';

export class NullEgress implements ILogEgress {
  readonly name = 'null';

  write(_entry: LogEntry): void {
    // Intentionally discards the entry.
  }
}
