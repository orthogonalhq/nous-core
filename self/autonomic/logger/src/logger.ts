/**
 * NousLogger — ILogger implementation with two-phase bootstrap.
 *
 * Phase 1 (construction): All channels enabled, console egress, LogLevel.Debug.
 * Phase 2 (bindConfig): Config-driven level, channel enable/disable via
 *   longest-prefix-match on the `logging.channels` config section.
 */
import { LogLevel } from '@nous/shared';
import type { IConfig, ILogger, ILogChannel, ILogEgress } from '@nous/shared';
import { LogChannel, type EgressSlot } from './log-channel.js';

const NAMESPACE_REGEX = /^nous:[a-z0-9]+(?:[:-][a-z0-9]+)*$/;

export class NousLogger implements ILogger {
  private _level: LogLevel = LogLevel.Debug;
  private readonly _channels = new Map<string, LogChannel>();
  private readonly _egresses: EgressSlot[] = [];
  private _channelConfig: Record<string, boolean> = {};

  channel(namespace: string): ILogChannel {
    const existing = this._channels.get(namespace);
    if (existing) return existing;

    if (!NAMESPACE_REGEX.test(namespace)) {
      throw new Error(
        `Invalid logger namespace "${namespace}". ` +
          'Expected format: nous:<subsystem> or nous:<subsystem>:<detail>, ' +
          'chars [a-z0-9:-]',
      );
    }

    const ch = new LogChannel(
      namespace,
      () => this._level,
      () => this._egresses,
    );
    ch._setEnabled(this._resolveChannelEnabled(namespace));
    this._channels.set(namespace, ch);
    return ch;
  }

  bindConfig(config: IConfig): void {
    const fullConfig = config.get() as {
      logging?: { level?: LogLevel; channels?: Record<string, boolean> };
    };
    const logging = fullConfig.logging;
    if (!logging) return;

    if (logging.level !== undefined) {
      this._level = logging.level;
    }

    if (logging.channels) {
      this._channelConfig = logging.channels;
      this._recomputeChannelStates();
    }
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  /**
   * Register an egress plugin.
   * Not on the ILogger interface — only available on the concrete class.
   */
  addEgress(egress: ILogEgress): void {
    // Prevent duplicate registration
    const existing = this._egresses.findIndex(
      (slot) => slot.egress.name === egress.name,
    );
    if (existing !== -1) {
      this._egresses[existing] = {
        egress,
        active: true,
        consecutiveFailures: 0,
      };
      return;
    }

    this._egresses.push({
      egress,
      active: true,
      consecutiveFailures: 0,
    });
  }

  /**
   * Remove an egress plugin by name.
   * Not on the ILogger interface — only available on the concrete class.
   */
  removeEgress(name: string): void {
    const idx = this._egresses.findIndex((slot) => slot.egress.name === name);
    if (idx !== -1) {
      this._egresses.splice(idx, 1);
    }
  }

  /**
   * Flush all egress plugins that support it.
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const slot of this._egresses) {
      if (slot.active && slot.egress.flush) {
        promises.push(slot.egress.flush());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Dispose all egress plugins that support it.
   */
  async dispose(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const slot of this._egresses) {
      if (slot.egress.dispose) {
        promises.push(slot.egress.dispose());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Resolve whether a channel namespace is enabled using
   * longest-prefix-match against config entries.
   *
   * `"nous:gateway": false` disables `nous:gateway`, `nous:gateway:auth`, etc.
   * Default: enabled.
   */
  private _resolveChannelEnabled(namespace: string): boolean {
    let bestPrefix = '';
    let bestValue = true; // default: all channels enabled

    for (const [pattern, enabled] of Object.entries(this._channelConfig)) {
      // Check if pattern is a prefix of namespace (or exact match)
      if (
        namespace === pattern ||
        namespace.startsWith(pattern + ':') ||
        namespace.startsWith(pattern + '-')
      ) {
        if (pattern.length > bestPrefix.length) {
          bestPrefix = pattern;
          bestValue = enabled;
        }
      }
    }

    return bestValue;
  }

  /**
   * Recompute enabled state for all cached channels after config change.
   */
  private _recomputeChannelStates(): void {
    for (const [namespace, ch] of this._channels) {
      ch._setEnabled(this._resolveChannelEnabled(namespace));
    }
  }
}
