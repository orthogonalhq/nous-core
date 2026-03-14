import { describe, expect, it } from 'vitest';
import {
  PublicMcpAgentCatalogEntrySchema,
  PublicMcpAgentInvokeResultSchema,
  PublicMcpAuditRecordSchema,
  PublicMcpDiscoveryBundleSchema,
  PublicMcpExecutionRequestSchema,
  PublicMcpNamespaceRecordSchema,
  PublicMcpRpcRequestSchema,
  PublicMcpSystemInfoSchema,
  PublicMcpTaskProjectionSchema,
  PublicMcpTaskResultSchema,
  PublicMcpToolMappingEntrySchema,
} from '../../types/public-mcp.js';

describe('public MCP shared types', () => {
  it('parses discovery documents', () => {
    const parsed = PublicMcpDiscoveryBundleSchema.parse({
      protectedResourceMetadata: {
        resource: 'urn:nous:ortho:mcp',
        authorization_servers: ['https://auth.example.com'],
        bearer_methods_supported: ['header'],
      },
      authorizationServerMetadata: {
        issuer: 'https://auth.example.com',
        token_endpoint: 'https://auth.example.com/token',
        scopes_supported: ['ortho.system.read'],
      },
    });

    expect(parsed.authorizationServerMetadata.issuer).toBe('https://auth.example.com');
  });

  it('parses tool mappings and normalized execution requests', () => {
    const mapping = PublicMcpToolMappingEntrySchema.parse({
      externalName: 'ortho.agents.v1.invoke',
      internalName: 'public_agent_invoke',
      requiredScopes: ['ortho.agents.invoke'],
      scopeStrategy: 'agent_invoke_with_bindings',
      phaseAvailability: '13.3',
      enabledInCurrentPhase: true,
      bootstrapMode: 'none',
      execution: {
        taskSupport: 'optional',
      },
    });
    const rpc = PublicMcpRpcRequestSchema.parse({
      jsonrpc: '2.0',
      id: 'rpc-1',
      method: 'tools/call',
      params: {
        name: mapping.externalName,
        arguments: {
          agentId: 'engineering.workflow',
          input: {
            type: 'text',
            text: 'Summarize the contract.',
          },
          memory: {
            readTiers: ['ltm'],
          },
          executionMode: 'async',
        },
      },
    });
    if (rpc.method !== 'tools/call') {
      throw new Error('Expected tools/call RPC request');
    }
    const execution = PublicMcpExecutionRequestSchema.parse({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      jsonrpc: '2.0',
      rpcId: rpc.id,
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: mapping.externalName,
      arguments: rpc.params.arguments,
      subject: {
        class: 'ExternalClient',
        clientId: 'client-1',
        clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        scopes: ['ortho.agents.invoke', 'ortho.memory.ltm.read'],
        audience: 'urn:nous:ortho:mcp',
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(execution.toolName).toBe(mapping.externalName);
    expect(execution.arguments).toEqual(rpc.params.arguments);
  });

  it('parses agent catalog, task projection, task result, and system info payloads', () => {
    const catalog = PublicMcpAgentCatalogEntrySchema.parse({
      agentId: 'engineering.workflow',
      title: 'Engineering Workflow',
      description: 'Public-safe engineering orchestration.',
      inputModes: ['text', 'packet', 'json'],
      memoryBinding: {
        supported: true,
        readTiers: ['stm', 'ltm'],
        writeTiers: ['stm'],
      },
      execution: {
        taskSupport: 'optional',
        asyncThreshold: 'long_running_only',
      },
    });
    const invokeResult = PublicMcpAgentInvokeResultSchema.parse({
      mode: 'task',
      task: {
        taskId: 'task-1',
        status: 'queued',
        runId: 'run-1',
      },
    });
    const task = PublicMcpTaskProjectionSchema.parse({
      taskId: 'task-1',
      toolName: 'ortho.agents.v1.invoke',
      subjectNamespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      canonicalRunId: 'run-1',
      status: 'running',
      submittedAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:01.000Z',
    });
    const taskResult = PublicMcpTaskResultSchema.parse({
      taskId: 'task-1',
      status: 'completed',
      result: {
        outputs: [{ type: 'text', text: 'done' }],
      },
    });
    const systemInfo = PublicMcpSystemInfoSchema.parse({
      server: {
        name: 'Nous Public MCP',
        phase: 'phase-13.3',
        backendMode: 'development',
        protocolVersion: '2025-11-25',
      },
      features: {
        publicAgents: true,
        publicSystemInfo: true,
        publicTasks: true,
        publicCompactAsync: true,
      },
      limits: {
        maxInvokeInputBytes: 8192,
        maxSearchTopK: 50,
        maxTaskPollWindowSeconds: 300,
      },
      quotas: {
        invokePerMinute: 10,
        compactPerMinute: 10,
      },
      tasks: {
        supportedMethods: ['tasks/get', 'tasks/result'],
        toolSupport: {
          'ortho.agents.v1.invoke': 'optional',
        },
      },
    });

    expect(catalog.execution.taskSupport).toBe('optional');
    expect(invokeResult.mode).toBe('task');
    expect(task.status).toBe('running');
    expect(taskResult.status).toBe('completed');
    expect(systemInfo.tasks.supportedMethods).toContain('tasks/result');
  });

  it('requires external-only namespace records and audit fields', () => {
    const namespace = PublicMcpNamespaceRecordSchema.parse({
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      stmCollection: 'external:stm:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      ltmCollection: 'external:ltm:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      mutationAuditCollection: 'external:audit:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      tombstoneCollection: 'external:tombstones:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      vectorCollection: 'external:vectors:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      bootstrapState: 'ready',
      createdAt: '2026-03-14T00:00:00.000Z',
      lastSeenAt: '2026-03-14T00:00:00.000Z',
    });
    const audit = PublicMcpAuditRecordSchema.parse({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2026-03-14T00:00:00.000Z',
      oauthClientId: 'client-1',
      namespace: namespace.namespace,
      toolName: 'ortho.system.v1.info',
      internalToolName: 'public_system_info',
      outcome: 'blocked',
      rejectReason: 'phase_not_enabled',
      latencyMs: 12,
      authorizationEventId: '550e8400-e29b-41d4-a716-446655440001' as any,
      completionEventId: '550e8400-e29b-41d4-a716-446655440002' as any,
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    expect(audit.namespace).toBe(namespace.namespace);
  });
});
