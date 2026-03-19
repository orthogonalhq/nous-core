// @vitest-environment jsdom

import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstallWizard } from '@nous/ui';
import type { AppInstallPreparation } from '@nous/shared';

const preparation: AppInstallPreparation = {
  package_id: 'telegram-connector',
  release_id: 'release-1',
  package_version: '1.0.0',
  app_id: 'telegram',
  display_name: 'Telegram Connector',
  description: 'Reference connector app',
  permissions: {
    network: ['api.telegram.org'],
    credentials: true,
    witnessLevel: 'session',
    systemNotify: false,
    memoryContribute: true,
  },
  config_groups: [
    {
      id: 'connector',
      label: 'Connector',
      fields: [
        {
          key: 'bot_username',
          type: 'string',
          required: false,
          label: 'Bot Username',
          group: 'connector',
          secret: false,
        },
      ],
    },
  ],
  stages: ['permission_review', 'configuration', 'validation_activation'],
  has_install_hook: true,
};

describe('InstallWizard', () => {
  it('renders permission review first and only submits after explicit approval-gated progression', async () => {
    const onInstall = vi.fn().mockResolvedValue({
      status: 'success',
      phase: 'completed',
      preparation,
      validation: {
        status: 'success',
        results: [],
      },
      witness_refs: [],
      stored_secrets: [],
      rollback_applied: false,
      recoverable: true,
      metadata: {},
    });

    render(
      <InstallWizard
        preparation={preparation}
        projectId="550e8400-e29b-41d4-a716-446655440801"
        actorId="web-test"
        onInstall={onInstall}
      />,
    );

    expect(
      screen.getByText(
        'Review the runtime permissions requested by this app before any configuration or activation work begins.',
      ),
    ).toBeTruthy();
    expect(onInstall).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve And Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate And Activate' }));

    await waitFor(() => {
      expect(onInstall).toHaveBeenCalledTimes(1);
    });
    expect(onInstall.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        permissions_approved: true,
        package_id: 'telegram-connector',
      }),
    );
  });
});
