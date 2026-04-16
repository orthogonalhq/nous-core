// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InboxEmptyState } from '../InboxEmptyState';

describe('InboxEmptyState', () => {
  it('renders "No notifications" text', () => {
    render(<InboxEmptyState />);
    expect(screen.getByText('No notifications')).toBeTruthy();
  });

  it('has data-testid for querying', () => {
    render(<InboxEmptyState />);
    expect(screen.getByTestId('inbox-empty-state')).toBeTruthy();
  });

  it('centers content', () => {
    render(<InboxEmptyState />);
    const el = screen.getByTestId('inbox-empty-state');
    expect(el.style.display).toBe('flex');
    expect(el.style.alignItems).toBe('center');
    expect(el.style.justifyContent).toBe('center');
  });
});
