// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxItemRow } from '../InboxItemRow';
import type { NotificationRecord } from '@nous/shared';

function makeNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 'test-id-1',
    kind: 'escalation',
    projectId: 'project-1',
    level: 'info',
    title: 'Test Notification',
    message: 'This is a test notification message',
    status: 'active',
    transient: false,
    source: 'test-source',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    escalation: {
      escalationId: 'esc-1',
      severity: 'medium',
      source: { surface: 'workflow', nodeDefinitionId: 'node-1' },
      status: 'pending',
      routeTargets: ['dashboard'],
      evidenceRefs: [],
      acknowledgements: [],
    },
    ...overrides,
  } as NotificationRecord;
}

describe('InboxItemRow', () => {
  it('renders title, message preview, and relative timestamp', () => {
    const notification = makeNotification();
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByTestId('inbox-item-title').textContent).toBe('Test Notification');
    expect(screen.getByTestId('inbox-item-message').textContent).toBe('This is a test notification message');
    expect(screen.getByTestId('inbox-item-timestamp').textContent).toBe('5m ago');
  });

  it('renders level-colored left accent bar for info level', () => {
    const notification = makeNotification({ level: 'info' });
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    const accent = screen.getByTestId('inbox-item-accent');
    expect(accent.style.backgroundColor).toBe('var(--nous-accent)');
  });

  it('renders level-colored left accent bar for warning level', () => {
    const notification = makeNotification({ level: 'warning' });
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    const accent = screen.getByTestId('inbox-item-accent');
    expect(accent.style.backgroundColor).toBe('var(--nous-warning)');
  });

  it('renders level-colored left accent bar for error level', () => {
    const notification = makeNotification({ level: 'error' });
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    const accent = screen.getByTestId('inbox-item-accent');
    expect(accent.style.backgroundColor).toBe('var(--nous-error)');
  });

  it('renders level-colored left accent bar for critical level with pulse', () => {
    const notification = makeNotification({ level: 'critical' });
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    const accent = screen.getByTestId('inbox-item-accent');
    expect(accent.style.backgroundColor).toBe('var(--nous-error)');
    expect(accent.style.animation).toContain('pulse');
  });

  it('renders kind-specific icon data attribute', () => {
    const notification = makeNotification({ kind: 'escalation' });
    render(
      <InboxItemRow notification={notification} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />,
    );

    const row = screen.getByTestId('inbox-item-row');
    expect(row.getAttribute('data-kind')).toBe('escalation');
  });

  it('click triggers onAcknowledge callback', () => {
    const onAcknowledge = vi.fn();
    const notification = makeNotification();
    render(
      <InboxItemRow notification={notification} onAcknowledge={onAcknowledge} onDismiss={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('inbox-item-row'));
    expect(onAcknowledge).toHaveBeenCalledWith('test-id-1');
  });

  it('dismiss button triggers onDismiss callback and does not propagate to acknowledge', () => {
    const onAcknowledge = vi.fn();
    const onDismiss = vi.fn();
    const notification = makeNotification();
    render(
      <InboxItemRow notification={notification} onAcknowledge={onAcknowledge} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByTestId('inbox-item-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith('test-id-1');
    expect(onAcknowledge).not.toHaveBeenCalled();
  });
});
