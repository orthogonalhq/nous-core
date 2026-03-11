// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModerationDashboardUseQuery: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    marketplace: {
      getModerationDashboard: { useQuery: mocks.getModerationDashboardUseQuery },
    },
  },
}));

import MarketplaceModerationPage from '@/app/(shell)/marketplace/moderation/page';

describe('MarketplaceModerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getModerationDashboardUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            package: {
              package_id: 'pkg.persona-engine',
              package_type: 'project',
              display_name: 'Persona Engine',
              latest_release_id: 'release-1',
              trust_tier: 'verified_maintainer',
              distribution_status: 'hold',
              compatibility_state: 'compatible',
              maintainer_ids: ['maintainer:1'],
              moderation_state: 'distribution_hold',
              evidence_refs: [],
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-10T00:00:00.000Z',
            },
            latestRelease: null,
            latestGovernanceAction: {
              action_id: 'action-1',
              action_type: 'apply_moderation_action',
              package_id: 'pkg.persona-engine',
              actor_id: 'principal',
              reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
              target_distribution_status: 'hold',
              target_moderation_state: 'distribution_hold',
              witness_ref: 'evt-1',
              evidence_refs: ['witness:evt-1'],
              created_at: '2026-03-10T00:00:00.000Z',
            },
            latestAppeal: {
              appeal_id: 'appeal-1',
              package_id: 'pkg.persona-engine',
              maintainer_id: 'maintainer:1',
              submitted_reason: 'Please review hold',
              submitted_evidence_refs: ['appeal:1'],
              status: 'submitted',
              created_at: '2026-03-10T00:00:00.000Z',
              updated_at: '2026-03-10T00:00:00.000Z',
            },
            escalationIds: ['550e8400-e29b-41d4-a716-446655445201'],
            deepLinks: [],
          },
        ],
        pendingAppealCount: 1,
        activeHoldCount: 1,
        delistedCount: 0,
        generatedAt: '2026-03-10T00:00:00.000Z',
      },
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders moderation posture, appeals, and escalation continuity', () => {
    render(<MarketplaceModerationPage />);

    expect(screen.getByText('Marketplace Moderation Dashboard')).toBeTruthy();
    expect(screen.getByText('Moderation dashboard')).toBeTruthy();
    expect(screen.getByText('Persona Engine')).toBeTruthy();
    expect(screen.getByText(/Latest appeal: submitted/i)).toBeTruthy();
    expect(screen.getByText(/Latest governance action/i)).toBeTruthy();
    expect(screen.getByText(/^escalation 550e8400/i)).toBeTruthy();
  });
});
