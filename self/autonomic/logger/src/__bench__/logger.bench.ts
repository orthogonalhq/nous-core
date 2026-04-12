/**
 * Manual benchmark for the logger hot path.
 *
 * Run with: npx vitest bench src/__bench__/logger.bench.ts
 */
import { bench, describe } from 'vitest';
import { LogLevel } from '@nous/shared';
import { NousLogger } from '../logger.js';
import { NullEgress } from '../egress/null-egress.js';

describe('Logger performance', () => {
  const logger = new NousLogger();
  logger.addEgress(new NullEgress());

  const enabledChannel = logger.channel('nous:bench-enabled');
  const disabledLogger = new NousLogger();
  disabledLogger.addEgress(new NullEgress());
  disabledLogger.bindConfig({
    get: () => ({
      logging: { level: LogLevel.Debug, channels: { 'nous:bench-disabled': false } },
    }),
    getSection: () => undefined as any,
    update: async () => {},
    reload: async () => {},
  });
  const disabledChannel = disabledLogger.channel('nous:bench-disabled');

  bench('enabled channel — info with data', () => {
    enabledChannel.info('benchmark message', { iteration: 1 });
  });

  bench('enabled channel — info without data', () => {
    enabledChannel.info('benchmark message');
  });

  bench('disabled channel — info (short-circuit)', () => {
    disabledChannel.info('should not emit', { iteration: 1 });
  });

  bench('channel() lookup (cached)', () => {
    logger.channel('nous:bench-enabled');
  });
});
