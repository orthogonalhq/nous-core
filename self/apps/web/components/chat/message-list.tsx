'use client';

import type { StmContext } from '@nous/shared';

export function MessageList({ context }: { context: StmContext }) {
  const { entries } = context;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          No messages yet. Send a message to start.
        </div>
      ) : (
        entries.map((entry, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 ${
              entry.role === 'user'
                ? 'ml-8 bg-primary text-primary-foreground'
                : 'mr-8 bg-muted'
            }`}
          >
            <div className="text-xs opacity-75">{entry.role}</div>
            <div className="whitespace-pre-wrap">{entry.content}</div>
          </div>
        ))
      )}
    </div>
  );
}
