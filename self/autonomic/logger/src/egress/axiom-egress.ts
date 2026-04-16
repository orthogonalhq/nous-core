/**
 * AxiomEgress — buffers log entries and batch-sends via HTTP to Axiom.
 *
 * Env-var-toggled: only active when AXIOM_TOKEN is set.
 * AXIOM_DATASET defaults to 'nous-dev'.
 * Flushes every 5 seconds or when buffer reaches 100 entries.
 */
import type { LogEntry, ILogEgress } from '@nous/shared';

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 100;

export class AxiomEgress implements ILogEgress {
  readonly name = 'axiom';

  private readonly _token: string;
  private readonly _dataset: string;
  private _buffer: LogEntry[] = [];
  private _flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(token: string, dataset?: string) {
    this._token = token;
    this._dataset = dataset ?? 'nous-dev';
    this._flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  write(entry: LogEntry): void {
    this._buffer.push(entry);
    if (this._buffer.length >= FLUSH_THRESHOLD) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this._buffer.length === 0) return;

    const batch = this._buffer;
    this._buffer = [];

    try {
      const response = await fetch(
        `https://api.axiom.co/v1/datasets/${this._dataset}/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this._token}`,
          },
          body: JSON.stringify(batch),
        },
      );
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[nous:logger:axiom] Flush failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[nous:logger:axiom] Flush error:', err);
    }
  }

  async dispose(): Promise<void> {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this.flush();
  }
}
