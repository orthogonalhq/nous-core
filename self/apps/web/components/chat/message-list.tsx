'use client';

import * as React from 'react';
import type { StmContext } from '@nous/shared';

export function MessageList({ context }: { context: StmContext }) {
  const { entries } = context;

  return (
    <div
      style={{
        display: 'flex',
        flex: '1 1 0%',
        flexDirection: 'column',
        gap: 'var(--nous-space-md)',
        overflow: 'auto',
        padding: 'var(--nous-space-md)',
      }}
    >
      {entries.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flex: '1 1 0%',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--nous-text-secondary)',
          }}
        >
          No messages yet. Send a message to start.
        </div>
      ) : (
        entries.map((entry, i) => (
          <div
            key={i}
            style={{
              borderRadius: 'var(--nous-radius-lg)',
              padding: 'var(--nous-space-sm)',
              ...(entry.role === 'user'
                ? {
                    marginLeft: 'var(--nous-space-2xl)',
                    background: 'var(--nous-accent)',
                    color: 'var(--nous-fg-on-color)',
                  }
                : {
                    marginRight: 'var(--nous-space-2xl)',
                    background: 'var(--nous-bg-hover)',
                  }),
            }}
          >
            <div
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                opacity: 0.75,
              }}
            >
              {entry.role}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{entry.content}</div>
          </div>
        ))
      )}
    </div>
  );
}
