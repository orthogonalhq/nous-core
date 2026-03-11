// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceDiscoveryFeed } from '@/components/marketplace/marketplace-discovery-feed';

describe('Marketplace deep-link continuity', () => {
  afterEach(() => {
    cleanup();
  });

  it('emits project and MAO links with marketplace continuity params', () => {
    render(
      <MarketplaceDiscoveryFeed
        isLoading={false}
        onRecordOpened={vi.fn()}
        onRouteAcceptance={vi.fn()}
        onSuppress={vi.fn()}
        snapshot={{
          projectId: '550e8400-e29b-41d4-a716-446655445301' as any,
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
                delivery_id: '550e8400-e29b-41d4-a716-446655445302',
                candidate_id: 'candidate-1',
                decision_id: 'decision-1',
                surface: 'discovery_card',
                outcome: 'delivered',
                reason_codes: ['NDG-DELIVERY-ALLOWED'],
                evidence_refs: [
                  {
                    actionCategory: 'trace-persist',
                  },
                ],
                delivered_at: '2026-03-10T00:00:00.000Z',
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
              deepLinks: [
                {
                  target: 'projects',
                  packageId: 'pkg.persona-engine',
                  projectId: '550e8400-e29b-41d4-a716-446655445301' as any,
                  releaseId: 'release-1',
                  candidateId: 'candidate-1',
                  evidenceRef: 'evidence://marketplace',
                },
                {
                  target: 'mao',
                  packageId: 'pkg.persona-engine',
                  projectId: '550e8400-e29b-41d4-a716-446655445301' as any,
                  releaseId: 'release-1',
                  candidateId: 'candidate-1',
                  evidenceRef: 'evidence://marketplace',
                },
              ],
            },
          ],
          blockedDeliveries: [],
          generatedAt: '2026-03-10T00:00:00.000Z',
        }}
      />,
    );

    const projectsLink = screen.getByRole('link', { name: 'Open Projects' });
    const maoLink = screen.getByRole('link', { name: 'Open MAO' });

    expect(projectsLink.getAttribute('href')).toContain('source=marketplace');
    expect(projectsLink.getAttribute('href')).toContain('packageId=pkg.persona-engine');
    expect(maoLink.getAttribute('href')).toContain('source=marketplace');
    expect(maoLink.getAttribute('href')).toContain('candidateId=candidate-1');
  });
});
