import * as React from 'react';
import type { MemoryEntry } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MemoryEntryListProps {
  entries: MemoryEntry[];
  isLoading: boolean;
  selectedEntryId: string | null;
  onSelect: (entryId: string) => void;
}

export function MemoryEntryList({
  entries,
  isLoading,
  selectedEntryId,
  onSelect,
}: MemoryEntryListProps) {
  return (
    <Card className="min-h-[24rem]">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Memory Entries</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading memory entries...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No entries matched the current query.
          </p>
        ) : (
          <ScrollArea className="max-h-[32rem] space-y-3 pr-1">
            <div className="space-y-3">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-muted/40'
                        : 'border-border hover:bg-muted/30'
                    }`}
                    onClick={() => onSelect(entry.id)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{entry.type}</Badge>
                          <Badge variant="secondary">{entry.scope}</Badge>
                          <Badge variant="outline">{entry.lifecycleStatus}</Badge>
                          <Badge variant="outline">{entry.placementState}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {excerpt(entry.content)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>confidence {entry.confidence.toFixed(2)}</div>
                        <div>{formatDate(entry.updatedAt)}</div>
                      </div>
                    </div>
                    {entry.tags.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        tags: {entry.tags.join(', ')}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function excerpt(content: string): string {
  if (content.length <= 140) {
    return content;
  }
  return `${content.slice(0, 137)}...`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
