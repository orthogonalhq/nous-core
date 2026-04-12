/**
 * InboxEmptyState — Centered "No notifications" message for empty or
 * filtered-empty inbox states.
 */
import * as React from 'react';

export function InboxEmptyState() {
  return (
    <div
      data-testid="inbox-empty-state"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        color: 'var(--nous-text-tertiary)',
        fontSize: 'var(--nous-font-size-md)',
        fontFamily: 'var(--nous-font-family)',
      }}
    >
      No notifications
    </div>
  );
}
