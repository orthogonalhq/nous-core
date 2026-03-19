// @vitest-environment jsdom

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  prepareAppInstallUseQuery: vi.fn(),
  installAppUseMutation: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    packages: {
      prepareAppInstall: { useQuery: mocks.prepareAppInstallUseQuery },
      installApp: { useMutation: mocks.installAppUseMutation },
    },
  },
}));

import { MarketplacePackageDetail } from '@/components/marketplace/marketplace-package-detail';

const snapshot = {
  package: {
    package_id: 'telegram-connector',
    display_name: 'Telegram Connector',
    trust_tier: 'verified_maintainer',
    distribution_status: 'active',
    compatibility_state: 'compatible',
  },
  latestRelease: {
    release_id: 'release-1',
    package_version: '1.0.0',
    origin_class: 'nous_first_party',
  },
  trustEligibility: null,
  maintainers: [],
  releases: [],
  governanceTimeline: [],
  appeals: [],
  deepLinks: [],
} as any;

describe('MarketplacePackageDetail', () => {
  it('renders the shared install wizard when project context is available', () => {
    mocks.prepareAppInstallUseQuery.mockReturnValue({
      data: {
        package_id: 'telegram-connector',
        release_id: 'release-1',
        package_version: '1.0.0',
        app_id: 'telegram',
        display_name: 'Telegram Connector',
        permissions: {
          network: ['api.telegram.org'],
          credentials: true,
          witnessLevel: 'session',
          systemNotify: false,
          memoryContribute: true,
        },
        config_groups: [],
        has_install_hook: true,
      },
      isLoading: false,
    });
    mocks.installAppUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(
      <MarketplacePackageDetail
        snapshot={snapshot}
        projectId="550e8400-e29b-41d4-a716-446655440802"
      />,
    );

    expect(screen.getByText('Install Wizard')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve And Continue' })).toBeTruthy();
  });

  it('shows the project-context requirement when no project id is available', () => {
    mocks.prepareAppInstallUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mocks.installAppUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(<MarketplacePackageDetail snapshot={snapshot} />);

    expect(
      screen.getByText(
        'Open this package with a project context to run the approval-gated install wizard.',
      ),
    ).toBeTruthy();
  });
});

