import * as React from 'react';
import type {
  Phase6ConfidenceSignalExport,
  Phase6DistilledPatternExport,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LearningPatternSummary {
  pattern: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  contradictionStatus: 'none' | 'detected' | 'blocking';
  stalenessStatus: 'fresh' | 'aging' | 'stale';
  flaggedForRetirement: boolean;
  sourceCount: number;
  missingSourceCount: number;
  lineageIntegrityStatus:
    | 'complete'
    | 'missing-sources'
    | 'missing-evidence'
    | 'mixed';
}

interface MemoryLearningOverviewProps {
  items: LearningPatternSummary[];
  isLoading: boolean;
  selectedPatternId: string | null;
  onSelect: (patternId: string) => void;
}

export function MemoryLearningOverview({
  items,
  isLoading,
  selectedPatternId,
  onSelect,
}: MemoryLearningOverviewProps) {
  return (
    <Card className="min-h-[24rem]">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Distilled Patterns</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading distilled patterns...
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No patterns matched the current learning filters.
          </p>
        ) : (
          <ScrollArea className="max-h-[32rem] space-y-3 pr-1">
            <div className="space-y-3">
              {items.map((item) => {
                const isSelected = item.pattern.id === selectedPatternId;
                return (
                  <button
                    key={item.pattern.id}
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-muted/40'
                        : 'border-border hover:bg-muted/30'
                    }`}
                    onClick={() => onSelect(item.pattern.id)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {item.confidenceSignal.tier}
                          </Badge>
                          <Badge variant="secondary">
                            {item.confidenceSignal.decayState ?? 'derived'}
                          </Badge>
                          <Badge variant="outline">
                            {item.lineageIntegrityStatus}
                          </Badge>
                          {item.flaggedForRetirement ? (
                            <Badge variant="outline">retirement flagged</Badge>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {excerpt(item.pattern.content)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>confidence {item.confidenceSignal.confidence.toFixed(2)}</div>
                        <div>{formatDate(item.pattern.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <span>
                        sources {item.sourceCount} / missing {item.missingSourceCount}
                      </span>
                      <span>
                        support {item.confidenceSignal.supportingSignals} / stale{' '}
                        {item.stalenessStatus}
                      </span>
                      <span>contradiction {item.contradictionStatus}</span>
                      <span>tags {item.pattern.tags.length}</span>
                    </div>
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
