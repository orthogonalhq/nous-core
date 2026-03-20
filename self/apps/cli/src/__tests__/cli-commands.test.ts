/**
 * CLI command behavior tests.
 * Uses mocked tRPC client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSend } from '../commands/send.js';
import {
  runProjectsList,
  runProjectsCreate,
  runProjectsSwitch,
} from '../commands/projects.js';
import { runConfigGet, runConfigSet } from '../commands/config.js';
import {
  runWitnessGet,
  runWitnessList,
  runWitnessVerify,
} from '../commands/witness.js';
import { runPkgDiscover, runPkgInstall } from '../commands/pkg.js';
import type { CliTrpcClient } from '../trpc-client.js';

function createMockClient(): CliTrpcClient {
  return {
    chat: {
      sendMessage: {
        mutate: vi.fn(),
      },
    },
    projects: {
      list: { query: vi.fn() },
      create: { mutate: vi.fn() },
      get: { query: vi.fn() },
    },
    config: {
      get: { query: vi.fn() },
      update: { mutate: vi.fn() },
    },
    witness: {
      verify: { mutate: vi.fn() },
      listReports: { query: vi.fn() },
      getReport: { query: vi.fn() },
      latestCheckpoint: { query: vi.fn() },
    },
    marketplace: {
      getDiscoveryFeed: { query: vi.fn() },
      applyNudgeSuppression: { mutate: vi.fn() },
      recordNudgeFeedback: { mutate: vi.fn() },
      routeNudgeAcceptance: { mutate: vi.fn() },
    },
    packages: {
      install: { mutate: vi.fn() },
    },
  } as unknown as CliTrpcClient;
}

describe('CLI commands', () => {
  let mockClient: CliTrpcClient;
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  it('send displays response to stdout', async () => {
    vi.mocked(mockClient.chat.sendMessage.mutate).mockResolvedValue({
      response: 'Hello from mock',
      traceId: 'trace-123' as import('@nous/shared').TraceId,
    });

    const code = await runSend(mockClient, 'hello');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('Hello from mock');
  });

  it('send returns 1 on connection error', async () => {
    vi.mocked(mockClient.chat.sendMessage.mutate).mockRejectedValue(
      new Error('fetch failed ECONNREFUSED'),
    );

    const code = await runSend(mockClient, 'hello');
    expect(code).toBe(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      'Cannot connect to Nous. Is the backend running? Start with: pnpm dev:web',
    );
  });

  it('projects list prints table', async () => {
    vi.mocked(mockClient.projects.list.query).mockResolvedValue([
      {
        id: 'proj-1' as import('@nous/shared').ProjectId,
        name: 'Test Project',
        type: 'hybrid',
      },
    ]);

    const code = await runProjectsList(mockClient);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('proj-1'),
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Test Project'),
    );
  });

  it('projects list shows message when empty', async () => {
    vi.mocked(mockClient.projects.list.query).mockResolvedValue([]);

    const code = await runProjectsList(mockClient);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('No projects'),
    );
  });

  it('projects create prints created project', async () => {
    vi.mocked(mockClient.projects.create.mutate).mockResolvedValue({
      id: 'new-id' as import('@nous/shared').ProjectId,
      name: 'New Project',
    });

    const code = await runProjectsCreate(mockClient, 'New Project');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Created project'),
    );
  });

  it('projects switch prints project when found', async () => {
    vi.mocked(mockClient.projects.get.query).mockResolvedValue({
      id: 'proj-1' as import('@nous/shared').ProjectId,
      name: 'My Project',
    });

    const code = await runProjectsSwitch(mockClient, 'proj-1');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('My Project'),
    );
  });

  it('projects switch returns 1 when project not found', async () => {
    vi.mocked(mockClient.projects.get.query).mockResolvedValue(null);

    const code = await runProjectsSwitch(mockClient, 'bad-id');
    expect(code).toBe(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('Project not found'),
    );
  });

  it('config get prints config', async () => {
    vi.mocked(mockClient.config.get.query).mockResolvedValue({
      pfcTier: 3,
      modelRoleAssignments: [],
    });

    const code = await runConfigGet(mockClient, false);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('Cortex Tier:', 3);
  });

  it('config get prints JSON when json flag', async () => {
    const config = { pfcTier: 2, modelRoleAssignments: [] };
    vi.mocked(mockClient.config.get.query).mockResolvedValue(config);

    const code = await runConfigGet(mockClient, true);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('"pfcTier"'),
    );
  });

  it('config set updates Cortex tier', async () => {
    vi.mocked(mockClient.config.update.mutate).mockResolvedValue(undefined);

    const code = await runConfigSet(mockClient, { pfcTier: 4 });
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('Updated Cortex tier to', 4);
  });

  it('witness verify prints summary lines', async () => {
    vi.mocked(mockClient.witness.verify.mutate).mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000' as import('@nous/shared').VerificationReportId,
      generatedAt: new Date().toISOString(),
      range: { fromSequence: 1, toSequence: 2 },
      ledger: {
        eventCount: 2,
        headEventHash: 'a'.repeat(64),
        sequenceContiguous: true,
        hashChainValid: true,
      },
      checkpoints: {
        checkpointCount: 1,
        headCheckpointHash: 'b'.repeat(64),
        checkpointChainValid: true,
        signaturesValid: true,
      },
      invariants: {
        findings: [],
        bySeverity: { S0: 0, S1: 0, S2: 0 },
      },
      status: 'pass',
      receipt: {
        id: '660e8400-e29b-41d4-a716-446655440001' as import('@nous/shared').AttestationReceiptId,
        mode: 'local',
        subjectType: 'verification-report',
        subjectHash: 'c'.repeat(64),
        keyEpoch: 1,
        signatureAlgorithm: 'ed25519',
        signature: 'sig',
        verified: true,
        issuedAt: new Date().toISOString(),
      },
    });

    const code = await runWitnessVerify(mockClient, {});
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Verification report'),
    );
  });

  it('witness list prints empty-state message', async () => {
    vi.mocked(mockClient.witness.listReports.query).mockResolvedValue([]);

    const code = await runWitnessList(mockClient, {});
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      'No witness verification reports found.',
    );
  });

  it('witness get returns 1 when report is missing', async () => {
    vi.mocked(mockClient.witness.getReport.query).mockResolvedValue(null);

    const code = await runWitnessGet(mockClient, {
      id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(code).toBe(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('Witness report not found'),
    );
  });

  it('pkg discover prints trust-eligibility-backed suggestions and suppression actions', async () => {
    vi.mocked(mockClient.marketplace.getDiscoveryFeed.query).mockResolvedValue({
      projectId: '550e8400-e29b-41d4-a716-446655445401' as import('@nous/shared').ProjectId,
      surface: 'cli_suggestion',
      cards: [
        {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['NDG-CANDIDATE-ELIGIBLE'],
            created_at: new Date().toISOString(),
          },
          decision: {
            decision_id: 'decision-1',
            candidate_id: 'candidate-1',
            rank_score: 0.8,
            rank_components_ref: 'rank:1',
            suppression_state: 'eligible',
            delivery_surface_set: ['cli_suggestion'],
            expires_at: new Date().toISOString(),
          },
          delivery: {
            delivery_id: '550e8400-e29b-41d4-a716-446655445402',
            candidate_id: 'candidate-1',
            decision_id: 'decision-1',
            surface: 'cli_suggestion',
            outcome: 'delivered',
            reason_codes: ['NDG-DELIVERY-ALLOWED'],
            evidence_refs: [{ actionCategory: 'trace-persist' }],
            delivered_at: new Date().toISOString(),
          },
          trustEligibility: {
            project_id: '550e8400-e29b-41d4-a716-446655445401' as import('@nous/shared').ProjectId,
            package_id: 'pkg.persona-engine',
            release_id: 'release-1',
            package_version: '1.0.0',
            trust_tier: 'verified_maintainer',
            distribution_status: 'active',
            compatibility_state: 'compatible',
            metadata_valid: true,
            signer_valid: true,
            requires_principal_override: false,
            block_reason_codes: [],
            evidence_refs: ['witness:evt-1'],
            evaluated_at: new Date().toISOString(),
          },
          whyThis: ['Persona Engine matches workflow friction'],
          availableSuppressionActions: [
            'dismiss_once',
            'snooze',
            'mute_category',
            'mute_project',
            'mute_global',
          ],
          activeSuppressions: [],
          deepLinks: [],
        },
      ],
      blockedDeliveries: [],
      generatedAt: new Date().toISOString(),
    });
    vi.mocked(mockClient.marketplace.recordNudgeFeedback.mutate).mockResolvedValue({
      feedback_id: 'feedback-1',
      candidate_id: 'candidate-1',
      event_type: 'opened',
      surface: 'cli_suggestion',
      occurred_at: new Date().toISOString(),
      evidence_refs: [{ actionCategory: 'trace-persist' }],
    } as any);

    const code = await runPkgDiscover(mockClient, {
      projectId: '550e8400-e29b-41d4-a716-446655445401',
    });

    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('pkg.persona-engine'),
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('dismiss_once'),
    );
  });

  it('pkg discover routes suppression mutations through the marketplace client', async () => {
    vi.mocked(mockClient.marketplace.getDiscoveryFeed.query).mockResolvedValue({
      projectId: '550e8400-e29b-41d4-a716-446655445401' as import('@nous/shared').ProjectId,
      surface: 'cli_suggestion',
      cards: [
        {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['NDG-CANDIDATE-ELIGIBLE'],
            created_at: new Date().toISOString(),
          },
          decision: {
            decision_id: 'decision-1',
            candidate_id: 'candidate-1',
            rank_score: 0.8,
            rank_components_ref: 'rank:1',
            suppression_state: 'eligible',
            delivery_surface_set: ['cli_suggestion'],
            expires_at: new Date().toISOString(),
          },
          delivery: {
            delivery_id: '550e8400-e29b-41d4-a716-446655445402',
            candidate_id: 'candidate-1',
            decision_id: 'decision-1',
            surface: 'cli_suggestion',
            outcome: 'delivered',
            reason_codes: ['NDG-DELIVERY-ALLOWED'],
            evidence_refs: [{ actionCategory: 'trace-persist' }],
            delivered_at: new Date().toISOString(),
          },
          trustEligibility: null,
          whyThis: ['Persona Engine matches workflow friction'],
          availableSuppressionActions: [
            'dismiss_once',
            'snooze',
            'mute_category',
            'mute_project',
            'mute_global',
          ],
          activeSuppressions: [],
          deepLinks: [],
        },
      ],
      blockedDeliveries: [],
      generatedAt: new Date().toISOString(),
    });
    vi.mocked(mockClient.marketplace.recordNudgeFeedback.mutate).mockResolvedValue({
      feedback_id: 'feedback-1',
      candidate_id: 'candidate-1',
      event_type: 'opened',
      surface: 'cli_suggestion',
      occurred_at: new Date().toISOString(),
      evidence_refs: [{ actionCategory: 'trace-persist' }],
    } as any);
    vi.mocked(mockClient.marketplace.applyNudgeSuppression.mutate).mockResolvedValue({
      suppression_id: '550e8400-e29b-41d4-a716-446655445403',
      action: 'snooze',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: ['cli_suggestion'],
      reason_codes: ['NDG-SUPPRESSION-SNOOZE-ACTIVE'],
      evidence_refs: [{ actionCategory: 'trace-persist' }],
      created_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
    } as any);

    const code = await runPkgDiscover(mockClient, {
      projectId: '550e8400-e29b-41d4-a716-446655445401',
      snoozeCandidateId: 'candidate-1',
    });

    expect(code).toBe(0);
    expect(mockClient.marketplace.applyNudgeSuppression.mutate).toHaveBeenCalled();
  });

  it('pkg install routes canonical install requests through the packages client', async () => {
    vi.mocked(mockClient.packages.install.mutate).mockResolvedValue({
      resolution: {
        root_package_id: 'pkg.persona-engine',
        nodes: [],
        install_order: ['pkg.persona-engine'],
        deduped_package_ids: [],
        blocked: false,
      },
      writes: [],
      lifecycle_results: [],
      status: 'installed',
    } as any);

    const code = await runPkgInstall(mockClient, 'pkg.persona-engine', {
      projectId: '550e8400-e29b-41d4-a716-446655445401',
    });

    expect(code).toBe(0);
    expect(mockClient.packages.install.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: '550e8400-e29b-41d4-a716-446655445401',
        package_id: 'pkg.persona-engine',
        actor_id: 'cli',
      }),
    );
  });
});
