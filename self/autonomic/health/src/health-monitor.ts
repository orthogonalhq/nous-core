/**
 * HealthMonitor — Real IHealthMonitor implementation.
 *
 * Delegates to IHealthAggregator for health data aggregation.
 * Replaces StubHealthMonitor which threw NOT_IMPLEMENTED on every call.
 */
import type {
  IHealthMonitor,
  IHealthAggregator,
  HealthReport,
  SystemMetrics,
} from '@nous/shared';

export class HealthMonitor implements IHealthMonitor {
  private readonly aggregator: IHealthAggregator;

  constructor(deps: { aggregator: IHealthAggregator }) {
    this.aggregator = deps.aggregator;
  }

  async check(): Promise<HealthReport> {
    const systemStatus = this.aggregator.getSystemStatus();
    const agentStatus = this.aggregator.getAgentStatus();

    const components: HealthReport['components'] = [];

    // Boot status component
    const bootComponentStatus =
      systemStatus.bootStatus === 'ready'
        ? ('healthy' as const)
        : systemStatus.bootStatus === 'booting'
          ? ('degraded' as const)
          : ('unhealthy' as const);

    components.push({
      name: 'boot',
      status: bootComponentStatus,
      message: systemStatus.bootStatus === 'ready'
        ? 'System boot complete'
        : `Boot status: ${systemStatus.bootStatus}`,
    });

    // Gateway components
    for (const gateway of agentStatus.gateways) {
      const hasIssues = gateway.issueCodes.length > 0;
      const gatewayStatus = !gateway.inboxReady
        ? ('degraded' as const)
        : hasIssues
          ? ('degraded' as const)
          : ('healthy' as const);

      components.push({
        name: gateway.agentClass,
        status: gatewayStatus,
        message: !gateway.inboxReady
          ? 'Inbox not ready'
          : hasIssues
            ? `Issues: ${gateway.issueCodes.join(', ')}`
            : undefined,
      });
    }

    // Derive overall healthy: boot is ready AND no issue codes in system status
    const healthy =
      systemStatus.bootStatus === 'ready' && systemStatus.issueCodes.length === 0;

    return {
      healthy,
      components,
      timestamp: new Date().toISOString(),
    };
  }

  async getMetrics(): Promise<SystemMetrics> {
    return {
      uptimeSeconds: process.uptime(),
      memoryUsageMb: process.memoryUsage().heapUsed / (1024 * 1024),
      storageUsageMb: 0,
      activeProjects: 0,
      totalMemoryEntries: 0,
    };
  }
}
