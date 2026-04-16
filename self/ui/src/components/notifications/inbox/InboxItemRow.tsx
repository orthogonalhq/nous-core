/**
 * InboxItemRow — Single notification row with level-colored accent bar,
 * kind-specific Lucide icon, title, message preview, relative timestamp,
 * and dismiss button. Click triggers acknowledge.
 */
import * as React from 'react';
import {
  AlertTriangle,
  DollarSign,
  Activity,
  AppWindow,
  Bell,
  X,
} from 'lucide-react';
import type { NotificationRecord, NotificationKind, NotificationLevel } from '@nous/shared';

export interface InboxItemRowProps {
  notification: NotificationRecord;
  onAcknowledge: (id: string) => void;
  onDismiss: (id: string) => void;
}

const KIND_ICONS: Record<NotificationKind, React.ComponentType<{ size?: number }>> = {
  escalation: AlertTriangle,
  alert: DollarSign,
  health: Activity,
  panel: AppWindow,
  toast: Bell,
};

const LEVEL_COLORS: Record<NotificationLevel, string> = {
  info: 'var(--nous-accent)',
  warning: 'var(--nous-warning)',
  error: 'var(--nous-error)',
  critical: 'var(--nous-error)',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function InboxItemRow({ notification, onAcknowledge, onDismiss }: InboxItemRowProps) {
  const [hovered, setHovered] = React.useState(false);

  const Icon = KIND_ICONS[notification.kind];
  const accentColor = LEVEL_COLORS[notification.level];
  const isCritical = notification.level === 'critical';

  const handleClick = React.useCallback(() => {
    onAcknowledge(notification.id);
  }, [notification.id, onAcknowledge]);

  const handleDismiss = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(notification.id);
    },
    [notification.id, onDismiss],
  );

  return (
    <div
      data-testid="inbox-item-row"
      data-notification-id={notification.id}
      data-level={notification.level}
      data-kind={notification.kind}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 'var(--nous-space-sm)',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        cursor: 'pointer',
        background: hovered ? 'var(--nous-bg-hover)' : 'transparent',
        borderBottom: '1px solid var(--nous-shell-column-border)',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Level-colored left accent bar */}
      <div
        data-testid="inbox-item-accent"
        className={isCritical ? 'nous-inbox-accent-pulse' : undefined}
        style={{
          width: 3,
          borderRadius: 2,
          backgroundColor: accentColor,
          flexShrink: 0,
          ...(isCritical
            ? { animation: 'nous-pulse 1.5s ease-in-out infinite' }
            : {}),
        }}
      />

      {/* Kind icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          flexShrink: 0,
          color: 'var(--nous-text-secondary)',
        }}
      >
        <Icon size={16} />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--nous-space-sm)',
          }}
        >
          <span
            data-testid="inbox-item-title"
            style={{
              fontWeight: 600,
              fontSize: 'var(--nous-font-size-sm)',
              color: 'var(--nous-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notification.title}
          </span>
          <span
            data-testid="inbox-item-timestamp"
            style={{
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-text-tertiary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <span
          data-testid="inbox-item-message"
          style={{
            fontSize: 'var(--nous-font-size-xs)',
            color: 'var(--nous-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {notification.message}
        </span>
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        data-testid="inbox-item-dismiss"
        aria-label="Dismiss notification"
        onClick={handleDismiss}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--nous-text-tertiary)',
          borderRadius: 'var(--nous-radius-sm)',
          flexShrink: 0,
          alignSelf: 'center',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
