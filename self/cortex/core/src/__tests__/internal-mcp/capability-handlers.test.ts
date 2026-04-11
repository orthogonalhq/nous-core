import { describe, expect, it, vi } from 'vitest';
import {
  createCapabilityHandlers,
  createScopedMcpToolSurface,
  isAppInternalMcpToolAuthorized,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  DEFAULT_TOOLS,
  PROJECT_ID,
  TRACE_ID,
  createOpctlService,
  createPfcEngine,
  createProjectApi,
  createWorkflowEngine,
} from '../agent-gateway/helpers.js';

describe('Internal MCP capability handlers', () => {
  it('denies memory_write when PFC rejects the candidate', async () => {
    const projectApi = createProjectApi();
    const pfc = createPfcEngine({
      evaluateMemoryWrite: vi.fn().mockResolvedValue({
        approved: false,
        reason: 'denied',
        confidence: 1,
      }),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => projectApi,
        pfc,
      },
    });

    await expect(
      surface.executeTool(
        'memory_write',
        {
          content: 'important fact',
          type: 'fact',
          scope: 'project',
          confidence: 0.9,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: TRACE_ID,
            source: 'test',
            timestamp: '2026-03-12T19:00:00.000Z',
          },
          tags: [],
        },
        {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
        },
      ),
    ).rejects.toThrow('denied');

    expect(projectApi.memory.write).not.toHaveBeenCalled();
  });

  it('returns external tool definitions through tool_list instead of the internal catalog', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () =>
          createProjectApi({
            tool: {
              execute: vi.fn(),
              list: vi.fn().mockResolvedValue(DEFAULT_TOOLS),
            },
          }),
        pfc: createPfcEngine(),
      },
    });

    const result = await surface.executeTool(
      'tool_list',
      {},
      {
        projectId: PROJECT_ID,
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual(DEFAULT_TOOLS);
    expect(JSON.stringify(result.output)).not.toContain('memory_search');
  });

  it('fails closed when a project-scoped capability lacks project context', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
    });

    await expect(surface.executeTool('artifact_store', {
      name: 'report.json',
      mimeType: 'application/json',
      data: '{}',
      contentEncoding: 'utf8',
      tags: [],
    })).rejects.toThrow('requires execution.projectId');
  });

  it('delegates public agent capabilities through the public surface seam', async () => {
    const publicMcpSurfaceService = {
      listAgents: vi.fn().mockResolvedValue([
        {
          agentId: 'engineering.workflow',
          title: 'Engineering Workflow',
          description: 'Public-safe engineering orchestration.',
          inputModes: ['text'],
          memoryBinding: {
            supported: false,
            readTiers: [],
            writeTiers: [],
          },
          execution: {
            taskSupport: 'optional',
            asyncThreshold: 'long_running_only',
          },
        },
      ]),
      invokeAgent: vi.fn().mockResolvedValue({
        mode: 'completed',
        runId: 'run-1',
        outputs: [{ type: 'text', text: 'done' }],
      }),
      getTask: vi.fn(),
      getTaskResult: vi.fn(),
      getSystemInfo: vi.fn().mockResolvedValue({
        server: {
          name: 'Nous Public MCP',
          phase: 'phase-13.4',
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
          maxTaskPollWindowSeconds: 300,
        },
        quotas: {
          invokePerMinute: 10,
        },
        tasks: {
          supportedMethods: ['tasks/get', 'tasks/result'],
          toolSupport: {
            'ortho.agents.v1.invoke': 'optional',
          },
        },
      }),
    };
    const handlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        publicMcpSurfaceService: publicMcpSurfaceService as any,
      },
    });

    const listResult = await handlers.public_agent_list({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      jsonrpc: '2.0',
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: 'ortho.agents.v1.list',
      arguments: {},
      subject: {
        class: 'ExternalClient',
        clientId: 'client-1',
        clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        scopes: ['ortho.system.read'],
        audience: 'urn:nous:ortho:mcp',
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(listResult.success).toBe(true);
    expect(publicMcpSurfaceService.listAgents).toHaveBeenCalled();
  });

  it('restricts promoted memory capabilities to Cortex::System', async () => {
    const promotedMemoryBridgeService = {
      promote: vi.fn().mockResolvedValue({ id: 'promoted-1' }),
      demote: vi.fn(),
      get: vi.fn(),
      search: vi.fn(),
    };
    const workerHandlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        promotedMemoryBridgeService: promotedMemoryBridgeService as any,
      },
    });
    const systemHandlers = createCapabilityHandlers({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID as any,
      deps: {
        promotedMemoryBridgeService: promotedMemoryBridgeService as any,
      },
    });

    await expect(
      workerHandlers.promoted_memory_promote({
        sourceNamespace:
          'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sourceRecordId: 'entry-1',
        rationale: 'promote',
      }),
    ).rejects.toThrow('restricted to Cortex::System');

    const result = await systemHandlers.promoted_memory_promote({
      sourceNamespace:
        'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sourceRecordId: 'entry-1',
      rationale: 'promote',
    });

    expect(result.success).toBe(true);
    expect(promotedMemoryBridgeService.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRecordId: 'entry-1',
      }),
    );
  });

  it('starts and inspects workflow lifecycle state through the system tool surface', async () => {
    const runState = {
      runId: '550e8400-e29b-41d4-a716-446655440610',
      workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440611',
      projectId: PROJECT_ID,
      workflowVersion: '1.0.0',
      graphDigest: 'a'.repeat(64),
      status: 'running',
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:start'],
      },
      activeNodeIds: ['550e8400-e29b-41d4-a716-446655440612'],
      activatedEdgeIds: [],
      readyNodeIds: ['550e8400-e29b-41d4-a716-446655440612'],
      waitingNodeIds: [],
      blockedNodeIds: [],
      completedNodeIds: [],
      checkpointState: 'idle',
      nodeStates: {},
      dispatchLineage: [],
      startedAt: '2026-03-16T20:00:00.000Z',
      updatedAt: '2026-03-16T20:00:00.000Z',
    } as any;
    const workflowEngine = createWorkflowEngine({
      start: vi.fn().mockResolvedValue({
        status: 'started',
        graph: {
          workflowDefinitionId: runState.workflowDefinitionId,
          projectId: PROJECT_ID,
          version: '1.0.0',
          graphDigest: 'a'.repeat(64),
          entryNodeIds: [runState.activeNodeIds[0]],
          topologicalOrder: [runState.activeNodeIds[0]],
          nodes: {},
          edges: {},
        },
        runState,
      }),
      getState: vi.fn().mockResolvedValue(runState),
      resolveDefinitionSource: vi.fn().mockResolvedValue(null),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () =>
          createProjectApi({
            project: {
              config: vi.fn().mockReturnValue({
                id: PROJECT_ID,
                name: 'Workflow Project',
                type: 'hybrid',
                pfcTier: 2,
                governanceDefaults: {
                  defaultNodeGovernance: 'must',
                  requireExplicitReviewForShouldDeviation: true,
                  blockedActionFeedbackMode: 'reason_coded',
                },
                memoryAccessPolicy: {
                  canReadFrom: 'all',
                  canBeReadBy: 'all',
                  inheritsGlobal: true,
                },
                escalationChannels: ['in-app'],
                escalationPreferences: {
                  routeByPriority: {
                    low: ['projects'],
                    medium: ['projects'],
                    high: ['projects', 'chat', 'mobile'],
                    critical: ['projects', 'chat', 'mao', 'mobile'],
                  },
                  acknowledgementSurfaces: ['projects', 'chat', 'mobile'],
                  mirrorToChat: true,
                },
                workflow: {
                  definitions: [
                    {
                      id: runState.workflowDefinitionId,
                      projectId: PROJECT_ID,
                      mode: 'hybrid',
                      version: '1.0.0',
                      name: 'Onboarding',
                      entryNodeIds: ['550e8400-e29b-41d4-a716-446655440612'],
                      nodes: [
                        {
                          id: '550e8400-e29b-41d4-a716-446655440612',
                          name: 'Start',
                          type: 'model-call',
                          governance: 'must',
                          executionModel: 'synchronous',
                          config: {
                            type: 'model-call',
                            modelRole: 'cortex-chat',
                            promptRef: 'prompt://start',
                          },
                        },
                      ],
                      edges: [],
                    },
                  ],
                  packageBindings: [],
                },
                packageDefaultIntake: [],
                retrievalBudgetTokens: 500,
                createdAt: '2026-03-16T20:00:00.000Z',
                updatedAt: '2026-03-16T20:00:00.000Z',
              } as any),
              state: vi.fn().mockReturnValue({
                status: 'active',
                activeWorkflows: 1,
                lastActivityAt: '2026-03-16T20:00:00.000Z',
              }),
              log: vi.fn(),
            },
          }),
        workflowEngine,
        opctlService: createOpctlService(),
      },
    });

    const started = await surface.executeTool('workflow_start', {
      definition: 'Onboarding',
      projectId: PROJECT_ID,
      config: {},
    });
    const status = await surface.executeTool('workflow_status', {
      runId: runState.runId,
    });

    expect(started.success).toBe(true);
    expect((started.output as any).run.runId).toBe(runState.runId);
    expect(status.success).toBe(true);
    expect((status.output as any).run.status).toBe('running');
  });

  it('pauses, resumes, and cancels workflow lifecycle runs through system-only tools', async () => {
    const runId = '550e8400-e29b-41d4-a716-446655440620';
    const workflowDefinitionId = '550e8400-e29b-41d4-a716-446655440621';
    const runningState = {
      runId,
      workflowDefinitionId,
      projectId: PROJECT_ID,
      workflowVersion: '1.0.0',
      graphDigest: 'b'.repeat(64),
      status: 'running',
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:start'],
      },
      activeNodeIds: ['550e8400-e29b-41d4-a716-446655440622'],
      activatedEdgeIds: [],
      readyNodeIds: ['550e8400-e29b-41d4-a716-446655440622'],
      waitingNodeIds: [],
      blockedNodeIds: [],
      completedNodeIds: [],
      checkpointState: 'idle',
      nodeStates: {},
      dispatchLineage: [],
      startedAt: '2026-03-16T20:00:00.000Z',
      updatedAt: '2026-03-16T20:00:00.000Z',
    } as any;
    const pausedState = { ...runningState, status: 'paused' } as any;
    const canceledState = {
      ...pausedState,
      status: 'canceled',
      activeNodeIds: [],
      readyNodeIds: [],
    } as any;
    const workflowEngine = createWorkflowEngine({
      getState: vi
        .fn()
        .mockResolvedValueOnce(runningState)
        .mockResolvedValueOnce(pausedState)
        .mockResolvedValueOnce(pausedState),
      pause: vi.fn().mockResolvedValue(pausedState),
      resume: vi.fn().mockResolvedValue(runningState),
      cancel: vi.fn().mockResolvedValue(canceledState),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID,
      deps: {
        workflowEngine,
        opctlService: createOpctlService(),
      },
    });

    const paused = await surface.executeTool('workflow_pause', { runId });
    const resumed = await surface.executeTool('workflow_resume', { runId });
    const canceled = await surface.executeTool('workflow_cancel', { runId });

    expect((paused.output as any).run.status).toBe('paused');
    expect((resumed.output as any).run.status).toBe('running');
    expect((canceled.output as any).run.status).toBe('canceled');
  });

  it('emits witness authorization and completion events for workflow lifecycle mutations', async () => {
    const runId = '550e8400-e29b-41d4-a716-446655440630';
    const workflowDefinitionId = '550e8400-e29b-41d4-a716-446655440631';
    const runningState = {
      runId,
      workflowDefinitionId,
      projectId: PROJECT_ID,
      workflowVersion: '1.0.0',
      graphDigest: 'c'.repeat(64),
      status: 'running',
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:start'],
      },
      activeNodeIds: ['550e8400-e29b-41d4-a716-446655440632'],
      activatedEdgeIds: [],
      readyNodeIds: ['550e8400-e29b-41d4-a716-446655440632'],
      waitingNodeIds: [],
      blockedNodeIds: [],
      completedNodeIds: [],
      checkpointState: 'idle',
      nodeStates: {},
      dispatchLineage: [],
      startedAt: '2026-03-16T20:00:00.000Z',
      updatedAt: '2026-03-16T20:00:00.000Z',
    } as any;
    const pausedState = {
      ...runningState,
      status: 'paused',
      updatedAt: '2026-03-16T20:01:00.000Z',
    } as any;
    const witnessService = {
      appendAuthorization: vi.fn().mockResolvedValue({ id: 'auth-1' }),
      appendCompletion: vi.fn().mockResolvedValue({ id: 'completion-1' }),
    };
    const workflowEngine = createWorkflowEngine({
      getState: vi.fn().mockResolvedValue(runningState),
      pause: vi.fn().mockResolvedValue(pausedState),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID,
      deps: {
        workflowEngine,
        opctlService: createOpctlService(),
        witnessService: witnessService as any,
      },
    });

    const paused = await surface.executeTool(
      'workflow_pause',
      { runId },
      {
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      },
    );

    expect((paused.output as any).run.status).toBe('paused');
    expect(witnessService.appendAuthorization).toHaveBeenCalledTimes(1);
    expect(witnessService.appendCompletion).toHaveBeenCalledTimes(1);
    expect(witnessService.appendAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCategory: 'opctl-command',
        actionRef: expect.stringContaining('workflow:'),
        status: 'approved',
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    );
    expect(witnessService.appendCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCategory: 'opctl-command',
        actionRef: expect.stringContaining('workflow:'),
        authorizationRef: 'auth-1',
        status: 'succeeded',
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    );
  });

  it('authorizes the ratified app-only health tools and denies workflow control tools', () => {
    expect(isAppInternalMcpToolAuthorized('health_report')).toBe(true);
    expect(isAppInternalMcpToolAuthorized('health_heartbeat')).toBe(true);
    expect(isAppInternalMcpToolAuthorized('credentials_store')).toBe(true);
    expect(isAppInternalMcpToolAuthorized('credentials_inject')).toBe(true);
    expect(isAppInternalMcpToolAuthorized('credentials_revoke')).toBe(true);
    expect(isAppInternalMcpToolAuthorized('workflow_start')).toBe(false);
  });

  it('routes app health tools through the app runtime service', async () => {
    const appRuntimeService = {
      updateHealth: vi.fn().mockResolvedValue({
        session_id: 'session-1',
        status: 'healthy',
        reported_at: '2026-03-17T06:00:00.000Z',
        stale: false,
        details: {},
      }),
      recordHeartbeat: vi.fn().mockResolvedValue({
        session_id: 'session-1',
        status: 'healthy',
        reported_at: '2026-03-17T06:00:05.000Z',
        stale: false,
        details: {},
      }),
    };
    const handlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        appRuntimeService: appRuntimeService as any,
      },
    });

    const report = await handlers.health_report({
      session_id: 'session-1',
      status: 'healthy',
      reported_at: '2026-03-17T06:00:00.000Z',
      stale: false,
      details: {},
    });
    const heartbeat = await handlers.health_heartbeat({
      session_id: 'session-1',
      reported_at: '2026-03-17T06:00:05.000Z',
      sequence: 1,
    });

    expect(report.success).toBe(true);
    expect((report.output as any).health.status).toBe('healthy');
    expect(heartbeat.success).toBe(true);
    expect((heartbeat.output as any).heartbeat.sequence).toBe(1);
    expect(appRuntimeService.updateHealth).toHaveBeenCalledTimes(1);
    expect(appRuntimeService.recordHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('stores, injects, and revokes credentials through the app-only governed surface', async () => {
    const credentialVaultService = {
      store: vi.fn().mockResolvedValue({
        credential_ref: 'credential:app:weather:weather_api',
        metadata: {
          app_id: 'app:weather',
          user_key: 'weather_api',
          credential_ref: 'credential:app:weather:weather_api',
          credential_type: 'bearer_token',
          target_host: 'api.weather.example',
          injection_location: 'header',
          injection_key: 'Authorization',
          created_at: '2026-03-17T06:10:00.000Z',
          updated_at: '2026-03-17T06:10:00.000Z',
        },
      }),
      revoke: vi.fn().mockResolvedValue({
        revoked: true,
        credential_ref: 'credential:app:weather:weather_api',
      }),
    };
    const credentialInjector = {
      executeInjectedRequest: vi.fn().mockResolvedValue({
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
        body: {
          ok: true,
        },
        credential_ref: 'credential:app:weather:weather_api',
        target_host: 'api.weather.example',
        executed_at: '2026-03-17T06:10:05.000Z',
      }),
    };
    const witnessService = {
      appendAuthorization: vi.fn().mockResolvedValue({ id: 'auth-1' }),
      appendCompletion: vi.fn().mockResolvedValue({ id: 'completion-1' }),
    };
    const handlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        credentialVaultService: credentialVaultService as any,
        credentialInjector: credentialInjector as any,
        getAppPermissions: () => ({
          credentials: true,
          network: ['api.weather.example'],
        }),
        witnessService: witnessService as any,
      },
    });

    const store = await handlers.credentials_store(
      {
        key: 'weather_api',
        value: 'secret-token',
        credential_type: 'bearer_token',
        target_host: 'api.weather.example',
        injection_location: 'header',
        injection_key: 'Authorization',
      },
      {
        appId: 'app:weather',
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      } as any,
    );
    const inject = await handlers.credentials_inject(
      {
        key: 'weather_api',
        request_descriptor: {
          method: 'GET',
          url: 'https://api.weather.example/forecast',
        },
      },
      {
        appId: 'app:weather',
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      } as any,
    );
    const revoke = await handlers.credentials_revoke(
      {
        key: 'weather_api',
        reason: 'rotate',
      },
      {
        appId: 'app:weather',
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      } as any,
    );

    expect(store.success).toBe(true);
    expect((store.output as any).credential_ref).toContain('weather_api');
    expect(JSON.stringify(store.output)).not.toContain('secret-token');
    expect(inject.success).toBe(true);
    expect((inject.output as any).status).toBe(200);
    expect(revoke.success).toBe(true);
    expect((revoke.output as any).revoked).toBe(true);
    expect(witnessService.appendAuthorization).toHaveBeenCalledTimes(3);
    expect(witnessService.appendCompletion).toHaveBeenCalledTimes(3);
  });

  it('denies artifact_store when PFC sensitivity check rejects the request', async () => {
    const projectApi = createProjectApi();
    const pfc = createPfcEngine({
      evaluateToolExecution: vi.fn().mockResolvedValue({
        approved: false,
        reason: 'artifact_store denied by policy',
        confidence: 1,
      }),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => projectApi,
        pfc,
      },
    });

    await expect(
      surface.executeTool(
        'artifact_store',
        {
          name: 'report.json',
          mimeType: 'application/json',
          data: '{}',
          contentEncoding: 'utf8',
          tags: [],
        },
        {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
        },
      ),
    ).rejects.toThrow('artifact_store denied by policy');

    expect(projectApi.artifact.store).not.toHaveBeenCalled();
  });

  it('allows artifact_store when PFC is unavailable (fail-open)', async () => {
    const projectApi = createProjectApi();
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => projectApi,
      },
    });

    const result = await surface.executeTool(
      'artifact_store',
      {
        name: 'report.json',
        mimeType: 'application/json',
        data: '{}',
        contentEncoding: 'utf8',
        tags: [],
      },
      {
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      },
    );

    expect(result.success).toBe(true);
    expect(projectApi.artifact.store).toHaveBeenCalled();
  });

  it('denies credential operations when app permissions do not grant them', async () => {
    const handlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        getAppPermissions: () => ({
          credentials: false,
          network: ['api.weather.example'],
        }),
      },
    });

    await expect(
      handlers.credentials_store(
        {
          key: 'weather_api',
          value: 'secret-token',
          credential_type: 'bearer_token',
          target_host: 'api.weather.example',
          injection_location: 'header',
          injection_key: 'Authorization',
        },
        {
          appId: 'app:weather',
          projectId: PROJECT_ID,
        } as any,
      ),
    ).rejects.toThrow('Credential access is not granted');
  });
});
