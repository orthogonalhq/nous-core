import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogLevel } from '@nous/shared';
import type { LogEntry, ILogEgress, IConfig } from '@nous/shared';
import { NousLogger } from '../logger.js';
import { ConsoleEgress } from '../egress/console-egress.js';
import { NullEgress } from '../egress/null-egress.js';

// --- Helpers ---

function createSpyEgress(name = 'spy'): ILogEgress & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    name,
    entries,
    write(entry: LogEntry) {
      entries.push(entry);
    },
  };
}

function createFailingEgress(name = 'failing'): ILogEgress & { callCount: number } {
  let callCount = 0;
  return {
    name,
    get callCount() {
      return callCount;
    },
    write() {
      callCount++;
      throw new Error('egress failure');
    },
  };
}

function createMockConfig(overrides?: {
  level?: LogLevel;
  channels?: Record<string, boolean>;
}): IConfig {
  return {
    get: () => ({
      logging: {
        level: overrides?.level ?? LogLevel.Debug,
        channels: overrides?.channels ?? {},
      },
    }),
    getSection: () => undefined as any,
    update: async () => {},
    reload: async () => {},
  };
}

// --- Tests ---

describe('NousLogger', () => {
  let logger: NousLogger;
  let spy: ReturnType<typeof createSpyEgress>;

  beforeEach(() => {
    logger = new NousLogger();
    spy = createSpyEgress();
    logger.addEgress(spy);
  });

  describe('channel()', () => {
    it('returns cached channel for same namespace', () => {
      const ch1 = logger.channel('nous:test');
      const ch2 = logger.channel('nous:test');
      expect(ch1).toBe(ch2);
    });

    it('throws on invalid namespace format', () => {
      expect(() => logger.channel('invalid')).toThrow('Invalid logger namespace');
      expect(() => logger.channel('NOUS:TEST')).toThrow('Invalid logger namespace');
      expect(() => logger.channel('nous:')).toThrow('Invalid logger namespace');
      expect(() => logger.channel('')).toThrow('Invalid logger namespace');
    });

    it('accepts valid namespace formats', () => {
      expect(() => logger.channel('nous:config')).not.toThrow();
      expect(() => logger.channel('nous:gateway:auth')).not.toThrow();
      expect(() => logger.channel('nous:cortex-pfc')).not.toThrow();
      expect(() => logger.channel('nous:a1b2')).not.toThrow();
    });
  });

  describe('log entry emission', () => {
    it('emits debug entries', () => {
      logger.channel('nous:test').debug('hello');
      expect(spy.entries).toHaveLength(1);
      expect(spy.entries[0].level).toBe(LogLevel.Debug);
      expect(spy.entries[0].namespace).toBe('nous:test');
      expect(spy.entries[0].message).toBe('hello');
      expect(spy.entries[0].timestamp).toBeGreaterThan(0);
    });

    it('emits info entries', () => {
      logger.channel('nous:test').info('info msg');
      expect(spy.entries[0].level).toBe(LogLevel.Info);
    });

    it('emits warn entries', () => {
      logger.channel('nous:test').warn('warn msg');
      expect(spy.entries[0].level).toBe(LogLevel.Warn);
    });

    it('emits error entries', () => {
      logger.channel('nous:test').error('error msg');
      expect(spy.entries[0].level).toBe(LogLevel.Error);
    });

    it('includes data when provided', () => {
      logger.channel('nous:test').info('with data', { key: 'value' });
      expect(spy.entries[0].data).toEqual({ key: 'value' });
    });

    it('omits data field when not provided', () => {
      logger.channel('nous:test').info('no data');
      expect(spy.entries[0].data).toBeUndefined();
    });
  });

  describe('level filtering', () => {
    it('filters entries below the configured level', () => {
      logger.setLevel(LogLevel.Warn);
      const ch = logger.channel('nous:test');
      ch.debug('skip');
      ch.info('skip');
      ch.warn('keep');
      ch.error('keep');
      expect(spy.entries).toHaveLength(2);
      expect(spy.entries[0].level).toBe(LogLevel.Warn);
      expect(spy.entries[1].level).toBe(LogLevel.Error);
    });

    it('defaults to Debug level (passes everything)', () => {
      const ch = logger.channel('nous:test');
      ch.debug('keep');
      ch.info('keep');
      ch.warn('keep');
      ch.error('keep');
      expect(spy.entries).toHaveLength(4);
    });
  });

  describe('channel enable/disable', () => {
    it('disabled channel short-circuits (no entry emitted)', () => {
      logger.bindConfig(
        createMockConfig({ channels: { 'nous:disabled': false } }),
      );
      logger.channel('nous:disabled').info('should not appear');
      expect(spy.entries).toHaveLength(0);
    });

    it('explicitly enabled channel emits entries', () => {
      logger.bindConfig(
        createMockConfig({ channels: { 'nous:enabled': true } }),
      );
      logger.channel('nous:enabled').info('visible');
      expect(spy.entries).toHaveLength(1);
    });

    it('channels default to enabled when not in config', () => {
      logger.bindConfig(createMockConfig({ channels: {} }));
      logger.channel('nous:unmentioned').info('visible');
      expect(spy.entries).toHaveLength(1);
    });
  });

  describe('longest-prefix-match for channels', () => {
    it('disabling a prefix disables child channels', () => {
      logger.bindConfig(
        createMockConfig({ channels: { 'nous:gateway': false } }),
      );
      logger.channel('nous:gateway').info('skip');
      logger.channel('nous:gateway:auth').info('skip');
      expect(spy.entries).toHaveLength(0);
    });

    it('more specific config overrides less specific', () => {
      logger.bindConfig(
        createMockConfig({
          channels: {
            'nous:gateway': false,
            'nous:gateway:auth': true,
          },
        }),
      );
      logger.channel('nous:gateway').info('skip');
      logger.channel('nous:gateway:auth').info('visible');
      expect(spy.entries).toHaveLength(1);
      expect(spy.entries[0].namespace).toBe('nous:gateway:auth');
    });

    it('recomputes states for already-created channels on bindConfig', () => {
      const ch = logger.channel('nous:recompute');
      ch.info('visible before');
      expect(spy.entries).toHaveLength(1);

      logger.bindConfig(
        createMockConfig({ channels: { 'nous:recompute': false } }),
      );
      ch.info('invisible after');
      expect(spy.entries).toHaveLength(1); // still 1
    });
  });

  describe('bindConfig()', () => {
    it('applies level from config', () => {
      logger.bindConfig(createMockConfig({ level: LogLevel.Error }));
      logger.channel('nous:test').warn('filtered');
      logger.channel('nous:test').error('kept');
      expect(spy.entries).toHaveLength(1);
      expect(spy.entries[0].level).toBe(LogLevel.Error);
    });

    it('handles missing logging section gracefully', () => {
      const config: IConfig = {
        get: () => ({}),
        getSection: () => undefined as any,
        update: async () => {},
        reload: async () => {},
      };
      expect(() => logger.bindConfig(config)).not.toThrow();
    });
  });

  describe('egress management', () => {
    it('addEgress delivers entries to the new egress', () => {
      const spy2 = createSpyEgress('spy2');
      logger.addEgress(spy2);
      logger.channel('nous:test').info('to both');
      expect(spy.entries).toHaveLength(1);
      expect(spy2.entries).toHaveLength(1);
    });

    it('removeEgress stops delivery to the removed egress', () => {
      logger.removeEgress('spy');
      logger.channel('nous:test').info('to nobody');
      expect(spy.entries).toHaveLength(0);
    });

    it('addEgress with duplicate name replaces the existing egress', () => {
      const spy2 = createSpyEgress('spy');
      logger.addEgress(spy2);
      logger.channel('nous:test').info('to replacement');
      expect(spy.entries).toHaveLength(0);
      expect(spy2.entries).toHaveLength(1);
    });

    it('removeEgress with unknown name is a no-op', () => {
      expect(() => logger.removeEgress('nonexistent')).not.toThrow();
    });
  });

  describe('egress failure handling', () => {
    it('auto-disables egress after 5 consecutive failures', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failing = createFailingEgress();
      logger.addEgress(failing);

      const ch = logger.channel('nous:test');
      // 5 failures to trigger auto-disable
      for (let i = 0; i < 5; i++) {
        ch.info(`attempt ${i}`);
      }
      // The spy egress still receives entries (it doesn't fail)
      expect(spy.entries).toHaveLength(5);
      // The failing egress was called 5 times
      expect(failing.callCount).toBe(5);

      // 6th call should not reach the failing egress
      ch.info('after disable');
      expect(failing.callCount).toBe(5); // no increase
      expect(spy.entries).toHaveLength(6);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('auto-disabled'),
      );
      warnSpy.mockRestore();
    });

    it('resets failure count on successful write', () => {
      let shouldFail = true;
      let callCount = 0;
      const flaky: ILogEgress = {
        name: 'flaky',
        write() {
          callCount++;
          if (shouldFail) throw new Error('fail');
        },
      };
      logger.addEgress(flaky);

      const ch = logger.channel('nous:test');
      // 4 failures (not enough to disable)
      for (let i = 0; i < 4; i++) {
        ch.info(`fail ${i}`);
      }
      expect(callCount).toBe(4);

      // Succeed once to reset counter
      shouldFail = false;
      ch.info('success');
      expect(callCount).toBe(5);

      // 4 more failures should not disable (counter was reset)
      shouldFail = true;
      for (let i = 0; i < 4; i++) {
        ch.info(`fail again ${i}`);
      }
      expect(callCount).toBe(9); // still receiving calls
    });
  });

  describe('flush and dispose', () => {
    it('flush calls flush on all active egresses', async () => {
      const flushFn = vi.fn().mockResolvedValue(undefined);
      const egressWithFlush: ILogEgress = {
        name: 'flushable',
        write() {},
        flush: flushFn,
      };
      logger.addEgress(egressWithFlush);
      await logger.flush();
      expect(flushFn).toHaveBeenCalledOnce();
    });

    it('dispose calls dispose on all egresses', async () => {
      const disposeFn = vi.fn().mockResolvedValue(undefined);
      const egressWithDispose: ILogEgress = {
        name: 'disposable',
        write() {},
        dispose: disposeFn,
      };
      logger.addEgress(egressWithDispose);
      await logger.dispose();
      expect(disposeFn).toHaveBeenCalledOnce();
    });
  });
});

describe('ConsoleEgress', () => {
  it('maps LogLevel to correct console method', () => {
    const egress = new ConsoleEgress();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    egress.write({
      level: LogLevel.Debug,
      namespace: 'nous:test',
      message: 'debug msg',
      timestamp: Date.now(),
    });
    expect(debugSpy).toHaveBeenCalledWith('[nous:test] debug msg');

    egress.write({
      level: LogLevel.Info,
      namespace: 'nous:test',
      message: 'info msg',
      timestamp: Date.now(),
    });
    expect(infoSpy).toHaveBeenCalledWith('[nous:test] info msg');

    egress.write({
      level: LogLevel.Warn,
      namespace: 'nous:test',
      message: 'warn msg',
      timestamp: Date.now(),
    });
    expect(warnSpy).toHaveBeenCalledWith('[nous:test] warn msg');

    egress.write({
      level: LogLevel.Error,
      namespace: 'nous:test',
      message: 'error msg',
      timestamp: Date.now(),
    });
    expect(errorSpy).toHaveBeenCalledWith('[nous:test] error msg');

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('includes JSON-serialized data in output', () => {
    const egress = new ConsoleEgress();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    egress.write({
      level: LogLevel.Info,
      namespace: 'nous:test',
      message: 'with data',
      data: { key: 'value' },
      timestamp: Date.now(),
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[nous:test] with data {"key":"value"}',
    );

    infoSpy.mockRestore();
  });
});

describe('NullEgress', () => {
  it('silently discards entries', () => {
    const egress = new NullEgress();
    expect(() =>
      egress.write({
        level: LogLevel.Info,
        namespace: 'nous:test',
        message: 'discarded',
        timestamp: Date.now(),
      }),
    ).not.toThrow();
  });
});
