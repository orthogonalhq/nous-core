import { describe, it, expect } from 'vitest';
import { NousError } from '@nous/shared';
import { StubHealthMonitor } from '../stub-health-monitor.js';

describe('StubHealthMonitor', () => {
  const monitor = new StubHealthMonitor();

  it('check() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(monitor.check()).rejects.toThrow(NousError);
    await expect(monitor.check()).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('getMetrics() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(monitor.getMetrics()).rejects.toThrow(NousError);
    await expect(monitor.getMetrics()).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});
