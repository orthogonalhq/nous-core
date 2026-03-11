// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browsePackagesUseQuery: vi.fn(),
  getDiscoveryFeedUseQuery: vi.fn(),
  recordNudgeFeedbackUseMutation: vi.fn(),
  routeNudgeAcceptanceUseMutation: vi.fn(),
  applyNudgeSuppressionUseMutation: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    marketplace: {
      browsePackages: { useQuery: mocks.browsePackagesUseQuery },
      getDiscoveryFeed: { useQuery: mocks.getDiscoveryFeedUseQuery },
      recordNudgeFeedback: { useMutation: mocks.recordNudgeFeedbackUseMutation },
      routeNudgeAcceptance: { useMutation: mocks.routeNudgeAcceptanceUseMutation },
      applyNudgeSuppression: { useMutation: mocks.applyNudgeSuppressionUseMutation },
    },
    useUtils: mocks.useUtils,
  },
}));

vi.mock('@/lib/project-context', () => ({
  useProject: mocks.useProject,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mocks.useSearchParams,
}));

import MarketplacePage from '@/app/(shell)/marketplace/page';

describe('MarketplacePage', () => {
  const recordFeedbackMutate = vi.fn();
  const routeAcceptanceMutate = vi.fn();
  const applySuppressionMutate = vi.fn();
  const invalidateFeed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655445101',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    });
    mocks.browsePackagesUseQuery.mockReturnValue({
      data: {
        query: {
          query: '',
          trustTiers: [],
          distributionStatuses: [],
          compatibilityStates: [],
          page: 1,
          pageSize: 12,
          projectId: '550e8400-e29b-41d4-a716-446655445101',
        },
        items: [
          {
            package: {
              package_id: 'pkg.persona-engine',
              package_type: 'project',
              display_name: 'Persona Engine',
              latest_release_id: 'release-1',
              trust_tier: 'verified_maintainer',
              distribution_status: 'active',
              compatibility_state: 'compatible',
              maintainer_ids: ['maintainer:1'],
              evidence_refs: [],
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-10T00:00:00.000Z',
            },
            latestRelease: {
              release_id: 'release-1',
              package_id: 'pkg.persona-engine',
              package_version: '1.0.0',
              origin_class: 'third_party_external',
              signing_key_id: 'key-1',
              signature_set_ref: 'sigset-1',
              source_hash: 'sha256:abc123',
              compatibility: {
                api_contract_range: '^1.0.0',
                capability_manifest: ['model.invoke'],
                migration_contract_version: '1',
                data_schema_versions: ['1'],
                policy_profile_defaults: [],
              },
              metadata_chain: {
                root_version: 1,
                timestamp_version: 1,
                snapshot_version: 1,
                targets_version: 1,
                trusted_root_key_ids: ['root-a'],
                delegated_key_ids: [],
                metadata_expires_at: '2026-03-12T00:00:00.000Z',
                artifact_digest: 'sha256:abc123',
                metadata_digest: 'sha256:def456',
              },
              distribution_status: 'active',
              compatibility_state: 'compatible',
              evidence_refs: [],
              published_at: '2026-03-10T00:00:00.000Z',
            },
            maintainers: [],
            trustEligibility: {
              project_id: '550e8400-e29b-41d4-a716-446655445101',
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
              evaluated_at: '2026-03-10T00:00:00.000Z',
            },
            deepLinks: [],
          },
        ],
        totalCount: 1,
        generatedAt: '2026-03-10T00:00:00.000Z',
      },
      isLoading: false,
    });
    mocks.getDiscoveryFeedUseQuery.mockReturnValue({
      data: {
        projectId: '550e8400-e29b-41d4-a716-446655445101',
        surface: 'discovery_card',
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
              created_at: '2026-03-10T00:00:00.000Z',
            },
            decision: {
              decision_id: 'decision-1',
              candidate_id: 'candidate-1',
              rank_score: 0.8,
              rank_components_ref: 'rank:1',
              suppression_state: 'eligible',
              delivery_surface_set: ['discovery_card'],
              expires_at: '2026-03-10T00:00:00.000Z',
            },
            delivery: {
              delivery_id: '550e8400-e29b-41d4-a716-446655445102',
              candidate_id: 'candidate-1',
              decision_id: 'decision-1',
              surface: 'discovery_card',
              outcome: 'delivered',
              reason_codes: ['NDG-DELIVERY-ALLOWED'],
              evidence_refs: [
                {
                  actionCategory: 'trace-persist',
                  authorizationEventId: '550e8400-e29b-41d4-a716-446655445103',
                },
              ],
              delivered_at: '2026-03-10T00:00:00.000Z',
            },
            trustEligibility: {
              project_id: '550e8400-e29b-41d4-a716-446655445101',
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
              evaluated_at: '2026-03-10T00:00:00.000Z',
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
        generatedAt: '2026-03-10T00:00:00.000Z',
      },
      isLoading: false,
    });
    mocks.recordNudgeFeedbackUseMutation.mockReturnValue({
      mutate: recordFeedbackMutate,
      isPending: false,
    });
    mocks.routeNudgeAcceptanceUseMutation.mockReturnValue({
      mutate: routeAcceptanceMutate,
      isPending: false,
    });
    mocks.applyNudgeSuppressionUseMutation.mockReturnValue({
      mutate: applySuppressionMutate,
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      marketplace: {
        getDiscoveryFeed: {
          invalidate: invalidateFeed,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders registry browse and discovery feed surfaces', () => {
    render(<MarketplacePage />);

    expect(screen.getByText('Marketplace Governance Surface')).toBeTruthy();
    expect(screen.getByText('Marketplace browser')).toBeTruthy();
    expect(screen.getByText('Discovery feed')).toBeTruthy();
    expect(screen.getByText('Persona Engine')).toBeTruthy();
    expect(screen.getAllByText('pkg.persona-engine').length).toBeGreaterThan(0);
    expect(screen.getByText('Persona Engine matches workflow friction')).toBeTruthy();
  });

  it('routes explicit suppression and acceptance actions through marketplace mutations', async () => {
    render(<MarketplacePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss once' }));
    fireEvent.click(screen.getByRole('button', { name: 'Route suggestion' }));

    await waitFor(() => {
      expect(applySuppressionMutate).toHaveBeenCalled();
      expect(routeAcceptanceMutate).toHaveBeenCalled();
    });

    expect(applySuppressionMutate.mock.calls[0]?.[0]?.action).toBe('dismiss_once');
    expect(routeAcceptanceMutate.mock.calls[0]?.[0]?.candidate_id).toBe('candidate-1');
  });
});
