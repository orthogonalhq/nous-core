import { describe, expect, it } from 'vitest';
import { WitnessService } from '@nous/subcortex-witnessd';
import { createInternalMcpSurfaceBundle } from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  createBaseInput,
  createDocumentStore,
  createGatewayHarness,
  createProjectApi,
  createWorkmodeAdmissionGuard,
} from './helpers.js';

describe('AgentGateway witness integration', () => {
  it('records verifiable witness evidence for acknowledgements and terminal completion', async () => {
    const witnessService = new WitnessService(createDocumentStore());
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        witnessService,
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });
    const { gateway } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'complete task',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      witnessService,
    });

    const result = await gateway.run(createBaseInput());
    const report = await witnessService.verify();

    expect(result.status).toBe('completed');
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(report.status).toBe('pass');
  });
});
