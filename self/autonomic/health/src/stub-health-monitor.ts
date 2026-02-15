/**
 * StubHealthMonitor — IHealthMonitor stub implementation.
 *
 * Throws NousError with code 'NOT_IMPLEMENTED' on every method call.
 * Real implementation arrives in Phase 1.8.
 */
import { NousError } from '@nous/shared';
import type { IHealthMonitor, HealthReport, SystemMetrics } from '@nous/shared';

export class StubHealthMonitor implements IHealthMonitor {
  async check(): Promise<HealthReport> {
    console.warn(
      '[nous:stub] IHealthMonitor.check() called — not implemented',
    );
    throw new NousError(
      'IHealthMonitor.check() is not implemented — real implementation in Phase 1.8',
      'NOT_IMPLEMENTED',
    );
  }

  async getMetrics(): Promise<SystemMetrics> {
    console.warn(
      '[nous:stub] IHealthMonitor.getMetrics() called — not implemented',
    );
    throw new NousError(
      'IHealthMonitor.getMetrics() is not implemented — real implementation in Phase 1.8',
      'NOT_IMPLEMENTED',
    );
  }
}
