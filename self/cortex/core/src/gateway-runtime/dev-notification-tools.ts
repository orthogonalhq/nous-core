/**
 * Dev Notification Tools
 *
 * `seed_test_notifications` and `clear_all_notifications` are dev-only
 * Principal bypass tools for behavioral testing of the unified notification
 * pipeline. They are registered on the Principal's tool surface via
 * `createDevNotificationToolSurface()` and gated behind
 * `NODE_ENV !== 'production'`.
 *
 * These tools call NotificationService.raise()/acknowledge()/dismiss()
 * directly, exercising the full pipeline: raise -> store -> event bus -> SSE.
 *
 * Reference: WR-151 SP 1.4 — Dev Test Tooling
 */
import type {
  INotificationService,
  IScopedMcpToolSurface,
  RaiseNotificationInput,
  ToolDefinition,
  ToolResult,
} from '@nous/shared';
import type { DocumentNotificationStore } from '@nous/subcortex-notification';

export const SEED_TEST_NOTIFICATIONS_TOOL_NAME = 'seed_test_notifications';
export const CLEAR_ALL_NOTIFICATIONS_TOOL_NAME = 'clear_all_notifications';

function success(output: unknown): ToolResult {
  return {
    success: true,
    output,
    durationMs: 0,
  };
}

function failure(error: string): ToolResult {
  return {
    success: false,
    output: { error },
    durationMs: 0,
  };
}

export function getDevNotificationToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: SEED_TEST_NOTIFICATIONS_TOOL_NAME,
      version: '1.0.0',
      description:
        'Create ~10 test notifications covering all 5 kinds, all severity levels, and all lifecycle states. Dev-only.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      outputSchema: {
        type: 'object',
        properties: {
          seeded: { type: 'number' },
          byKind: { type: 'object' },
          byLevel: { type: 'object' },
          byStatus: { type: 'object' },
        },
      },
      capabilities: ['runtime', 'dev'],
      permissionScope: 'system_inbox',
    },
    {
      name: CLEAR_ALL_NOTIFICATIONS_TOOL_NAME,
      version: '1.0.0',
      description:
        'Remove all notifications from the store. Dev-only.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      outputSchema: {
        type: 'object',
        properties: {
          deleted: { type: 'number' },
        },
      },
      capabilities: ['runtime', 'dev'],
      permissionScope: 'system_inbox',
    },
  ];
}

/**
 * Build the list of test notifications to seed. Each entry uses a unique
 * title incorporating kind + severity to avoid the 60-second dedup window.
 */
function buildSeedInputs(): RaiseNotificationInput[] {
  return [
    // Escalation — critical
    {
      kind: 'escalation',
      projectId: null,
      title: '[Test] Escalation — critical',
      message: 'Test escalation notification with critical severity',
      transient: false,
      source: 'dev-test-tooling',
      escalation: {
        escalationId: '00000000-0000-4000-8000-000000000001' as any,
        severity: 'critical',
        source: 'workflow',
        status: 'queued',
        routeTargets: ['chat'],
        evidenceRefs: [],
        acknowledgements: [],
      },
    },
    // Escalation — low (will be acknowledged)
    {
      kind: 'escalation',
      projectId: null,
      title: '[Test] Escalation — low',
      message: 'Test escalation notification with low severity',
      transient: false,
      source: 'dev-test-tooling',
      escalation: {
        escalationId: '00000000-0000-4000-8000-000000000002' as any,
        severity: 'low',
        source: 'control',
        status: 'queued',
        routeTargets: ['chat'],
        evidenceRefs: [],
        acknowledgements: [],
      },
    },
    // Alert — budget-exceeded (error)
    {
      kind: 'alert',
      projectId: null,
      title: '[Test] Alert — budget-exceeded',
      message: 'Test alert notification for budget exceeded',
      transient: false,
      source: 'dev-test-tooling',
      alert: {
        category: 'budget-exceeded',
        utilizationPercent: 120,
        currentSpendUsd: 12,
        budgetCeilingUsd: 10,
      },
    },
    // Alert — budget-warning (warning, will be dismissed)
    {
      kind: 'alert',
      projectId: null,
      title: '[Test] Alert — budget-warning',
      message: 'Test alert notification for budget warning',
      transient: false,
      source: 'dev-test-tooling',
      alert: {
        category: 'budget-warning',
        utilizationPercent: 80,
        currentSpendUsd: 8,
        budgetCeilingUsd: 10,
      },
    },
    // Health — warning
    {
      kind: 'health',
      projectId: null,
      title: '[Test] Health — warning',
      message: 'Test health notification with warning severity',
      transient: false,
      source: 'dev-test-tooling',
      health: {
        issueId: 'test-issue-1',
        severity: 'warning',
      },
    },
    // Health — error (will be acknowledged)
    {
      kind: 'health',
      projectId: null,
      title: '[Test] Health — error',
      message: 'Test health notification with error severity',
      transient: false,
      source: 'dev-test-tooling',
      health: {
        issueId: 'test-issue-2',
        severity: 'error',
      },
    },
    // Panel — info
    {
      kind: 'panel',
      projectId: null,
      title: '[Test] Panel — info',
      message: 'Test panel notification with info level',
      transient: false,
      source: 'dev-test-tooling',
      panel: {
        panelId: 'test-panel-1',
        level: 'info',
      },
    },
    // Panel — warning (will be dismissed)
    {
      kind: 'panel',
      projectId: null,
      title: '[Test] Panel — warning',
      message: 'Test panel notification with warning level',
      transient: false,
      source: 'dev-test-tooling',
      panel: {
        panelId: 'test-panel-2',
        level: 'warning',
      },
    },
    // Toast — info
    {
      kind: 'toast',
      projectId: null,
      title: '[Test] Toast — info',
      message: 'Test toast notification with info severity',
      transient: true,
      source: 'dev-test-tooling',
      toast: {
        severity: 'info',
        dismissible: true,
        durationMs: 8000,
      },
    },
    // Toast — error
    {
      kind: 'toast',
      projectId: null,
      title: '[Test] Toast — error',
      message: 'Test toast notification with error severity',
      transient: true,
      source: 'dev-test-tooling',
      toast: {
        severity: 'error',
        dismissible: true,
        durationMs: 8000,
      },
    },
  ];
}

export interface DevNotificationToolSurfaceArgs {
  baseToolSurface: IScopedMcpToolSurface;
  notificationService: INotificationService;
  notificationStore: DocumentNotificationStore;
}

export function createDevNotificationToolSurface(
  args: DevNotificationToolSurfaceArgs,
): IScopedMcpToolSurface {
  const extraDefinitions = getDevNotificationToolDefinitions();

  return {
    listTools: async () => {
      const baseTools = await args.baseToolSurface.listTools();
      return [...baseTools, ...extraDefinitions];
    },
    executeTool: async (name, params, execution) => {
      if (name === SEED_TEST_NOTIFICATIONS_TOOL_NAME) {
        return handleSeedTestNotifications(args.notificationService);
      }

      if (name === CLEAR_ALL_NOTIFICATIONS_TOOL_NAME) {
        return handleClearAllNotifications(args.notificationStore);
      }

      return args.baseToolSurface.executeTool(name, params, execution);
    },
  };
}

async function handleSeedTestNotifications(
  notificationService: INotificationService,
): Promise<ToolResult> {
  try {
    const inputs = buildSeedInputs();
    const records = [];
    for (const input of inputs) {
      const record = await notificationService.raise(input);
      records.push(record);
    }

    // Transition some to non-active states:
    // - Index 1 (escalation-low) -> acknowledged
    // - Index 5 (health-error) -> acknowledged
    // - Index 3 (alert-budget-warning) -> dismissed
    // - Index 7 (panel-warning) -> dismissed
    await notificationService.acknowledge(records[1].id);
    await notificationService.acknowledge(records[5].id);
    await notificationService.dismiss(records[3].id);
    await notificationService.dismiss(records[7].id);

    // Re-fetch to get updated statuses
    const updatedRecords = [];
    for (const r of records) {
      const updated = await notificationService.get(r.id);
      if (updated) updatedRecords.push(updated);
    }

    // Build summary
    const byKind: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const r of updatedRecords) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return success({
      seeded: updatedRecords.length,
      byKind,
      byLevel,
      byStatus,
    });
  } catch (err) {
    return failure(
      err instanceof Error ? err.message : 'Unknown error during seed',
    );
  }
}

async function handleClearAllNotifications(
  notificationStore: DocumentNotificationStore,
): Promise<ToolResult> {
  try {
    const deleted = await notificationStore.deleteAll();
    return success({ deleted });
  } catch (err) {
    return failure(
      err instanceof Error ? err.message : 'Unknown error during clear',
    );
  }
}
