/**
 * InboxView — Main inbox list component. Scopes via optional `projectId`
 * prop or resolves internally via `useShellContext().activeProjectId`.
 * Supports kind-based filtering and load-more pagination.
 */
import * as React from 'react';
import type { NotificationKind } from '@nous/shared';
import { useShellContext } from '../../shell/ShellContext';
import { useInboxData } from './useInboxData';
import { InboxItemRow } from './InboxItemRow';
import { InboxEmptyState } from './InboxEmptyState';

export interface InboxViewProps {
  /** Optional project scope override. Defaults to useShellContext().activeProjectId. */
  projectId?: string;
}

const KIND_FILTER_OPTIONS: Array<{ label: string; value: NotificationKind | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Escalations', value: 'escalation' },
  { label: 'Alerts', value: 'alert' },
  { label: 'System', value: 'health' },
];

export function InboxView({ projectId: projectIdProp }: InboxViewProps) {
  const { activeProjectId } = useShellContext();
  const resolvedProjectId = projectIdProp ?? activeProjectId;

  const {
    notifications,
    isLoading,
    hasMore,
    loadMore,
    acknowledge,
    dismiss,
    kindFilter,
    setKindFilter,
  } = useInboxData(resolvedProjectId);

  return (
    <div
      data-testid="inbox-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--nous-content-bg)',
      }}
    >
      {/* Header with kind filter tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-sm)',
          padding: 'var(--nous-space-sm) var(--nous-space-md)',
          borderBottom: '1px solid var(--nous-shell-column-border)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--nous-font-size-lg)',
            fontWeight: 600,
            color: 'var(--nous-text-primary)',
            fontFamily: 'var(--nous-font-family)',
          }}
        >
          Inbox
        </h2>
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginLeft: 'var(--nous-space-md)',
          }}
        >
          {KIND_FILTER_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              data-testid={`inbox-filter-${option.label.toLowerCase()}`}
              onClick={() => setKindFilter(option.value)}
              style={{
                padding: 'var(--nous-space-xs) var(--nous-space-sm)',
                border: 'none',
                borderRadius: 'var(--nous-radius-sm)',
                cursor: 'pointer',
                fontSize: 'var(--nous-font-size-xs)',
                fontFamily: 'var(--nous-font-family)',
                background:
                  kindFilter === option.value
                    ? 'var(--nous-bg-active)'
                    : 'transparent',
                color:
                  kindFilter === option.value
                    ? 'var(--nous-text-primary)'
                    : 'var(--nous-text-secondary)',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {isLoading ? (
          <div
            data-testid="inbox-loading"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 200,
              color: 'var(--nous-text-tertiary)',
              fontSize: 'var(--nous-font-size-md)',
            }}
          >
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <InboxEmptyState />
        ) : (
          <>
            {notifications.map((notification) => (
              <InboxItemRow
                key={notification.id}
                notification={notification}
                onAcknowledge={acknowledge}
                onDismiss={dismiss}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                data-testid="inbox-load-more"
                onClick={loadMore}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 'var(--nous-space-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--nous-accent)',
                  cursor: 'pointer',
                  fontSize: 'var(--nous-font-size-sm)',
                  fontFamily: 'var(--nous-font-family)',
                  textAlign: 'center',
                }}
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
