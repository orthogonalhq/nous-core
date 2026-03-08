import * as React from 'react';
import type {
  MemoryEntry,
  MemoryMutationAuditRecord,
  MemoryTombstone,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MemoryEntryDetailProps {
  entry: MemoryEntry | null;
  audit: MemoryMutationAuditRecord[];
  tombstones: MemoryTombstone[];
  deleteMode: 'soft' | 'hard' | null;
  deleteRationale: string;
  isDeleting: boolean;
  onStartDelete: (mode: 'soft' | 'hard') => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDeleteRationaleChange: (value: string) => void;
  onOpenLearning?: (entryId: string) => void;
}

export function MemoryEntryDetail({
  entry,
  audit,
  tombstones,
  deleteMode,
  deleteRationale,
  isDeleting,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onDeleteRationaleChange,
  onOpenLearning,
}: MemoryEntryDetailProps) {
  const learningPattern = entry ? getLearningPatternFields(entry) : null;

  return (
    <Card className="min-h-[24rem]">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Entry Detail</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {!entry ? (
          <p className="text-sm text-muted-foreground">
            Select an entry to inspect provenance, audit context, and governed actions.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{entry.type}</Badge>
                <Badge variant="secondary">{entry.scope}</Badge>
                <Badge variant="outline">{entry.lifecycleStatus}</Badge>
                <Badge variant="outline">{entry.placementState}</Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {entry.content}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DetailSection title="Provenance">
                <DetailRow label="Trace ID" value={entry.provenance.traceId} />
                <DetailRow label="Source" value={entry.provenance.source} />
                <DetailRow label="Timestamp" value={entry.provenance.timestamp} />
                <DetailRow label="Created" value={entry.createdAt} />
                <DetailRow label="Updated" value={entry.updatedAt} />
                <DetailRow
                  label="Tags"
                  value={entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}
                />
              </DetailSection>

              <DetailSection title="State and Confidence">
                <DetailRow label="Confidence" value={entry.confidence.toFixed(2)} />
                <DetailRow label="Mutability" value={entry.mutabilityClass} />
                <DetailRow label="Lifecycle" value={entry.lifecycleStatus} />
                <DetailRow label="Placement" value={entry.placementState} />
                <DetailRow
                  label="Superseded by"
                  value={entry.supersededBy ?? 'n/a'}
                />
                <DetailRow label="Tombstone" value={entry.tombstoneId ?? 'n/a'} />
              </DetailSection>
            </div>

            {entry.type === 'experience-record' ? (
              <DetailSection title="Structured Experience Fields">
                <DetailRow label="Sentiment" value={entry.sentiment ?? 'n/a'} />
                <DetailRow label="Context" value={entry.context ?? 'n/a'} />
                <DetailRow label="Action" value={entry.action ?? 'n/a'} />
                <DetailRow label="Outcome" value={entry.outcome ?? 'n/a'} />
                <DetailRow label="Reason" value={entry.reason ?? 'n/a'} />
              </DetailSection>
            ) : null}

            {learningPattern ? (
              <DetailSection title="Learning Visibility">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Distilled patterns can be inspected in the dedicated learning
                    view for source timelines, derived lifecycle events, and
                    representative governance projections.
                  </p>
                  <DetailRow
                    label="Based on"
                    value={learningPattern.basedOn.join(', ') || 'none'}
                  />
                  <DetailRow
                    label="Supersedes"
                    value={learningPattern.supersedes.join(', ') || 'none'}
                  />
                  <DetailRow
                    label="Evidence refs"
                    value={
                      learningPattern.evidenceRefs.length > 0
                        ? learningPattern.evidenceRefs
                            .map(formatEvidenceRef)
                            .join(', ')
                        : 'none'
                    }
                  />
                  {onOpenLearning ? (
                    <div className="pt-1">
                      <Button
                        variant="outline"
                        onClick={() => onOpenLearning(entry.id)}
                      >
                        Open learning visibility
                      </Button>
                    </div>
                  ) : null}
                </div>
              </DetailSection>
            ) : null}

            <DetailSection title="Governed Actions">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => onStartDelete('soft')}
                  disabled={isDeleting}
                >
                  Soft delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onStartDelete('hard')}
                  disabled={isDeleting}
                >
                  Hard delete
                </Button>
              </div>

              {deleteMode ? (
                <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm text-muted-foreground">
                    {deleteMode === 'soft'
                      ? 'Soft delete preserves content for audit while removing the entry from the active view.'
                      : 'Hard delete redacts content, requires rationale, and preserves a tombstone proof.'}
                  </p>
                  {deleteMode === 'hard' ? (
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">Rationale</span>
                      <Input
                        placeholder="why this hard delete is required"
                        value={deleteRationale}
                        onChange={(event) =>
                          onDeleteRationaleChange(event.target.value)
                        }
                      />
                    </label>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onConfirmDelete} disabled={isDeleting}>
                      {isDeleting
                        ? 'Applying...'
                        : deleteMode === 'soft'
                          ? 'Confirm soft delete'
                          : 'Confirm hard delete'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={onCancelDelete}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </DetailSection>

            <DetailSection title="Mutation Audit">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No audit records are linked to this entry yet.
                </p>
              ) : (
                <ScrollArea className="max-h-56 space-y-3">
                  <div className="space-y-3">
                    {audit.map((record) => (
                      <div
                        key={record.id}
                        className="rounded-md border border-border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{record.action}</Badge>
                          <Badge variant="secondary">{record.outcome}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {record.reasonCode}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{record.reason}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          actor {record.actor} · at {record.occurredAt}
                        </p>
                        {record.evidenceRefs.length > 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            evidence: {record.evidenceRefs.map(formatEvidenceRef).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </DetailSection>

            <DetailSection title="Tombstones">
              {tombstones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tombstone proof is linked to this entry.
                </p>
              ) : (
                <div className="space-y-3">
                  {tombstones.map((tombstone) => (
                    <div
                      key={tombstone.id}
                      className="rounded-md border border-border p-3 text-sm"
                    >
                      <DetailRow label="Tombstone ID" value={tombstone.id} />
                      <DetailRow label="Created" value={tombstone.createdAt} />
                      <DetailRow label="Target hash" value={tombstone.targetContentHash} />
                      <DetailRow label="Reason" value={tombstone.reason} />
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getLearningPatternFields(
  entry: MemoryEntry,
): {
  basedOn: string[];
  supersedes: string[];
  evidenceRefs: MemoryMutationAuditRecord['evidenceRefs'];
} | null {
  if (entry.type !== 'distilled-pattern') {
    return null;
  }

  const pattern = entry as MemoryEntry & {
    basedOn?: string[];
    supersedes?: string[];
    evidenceRefs?: MemoryMutationAuditRecord['evidenceRefs'];
  };

  return {
    basedOn: pattern.basedOn ?? [],
    supersedes: pattern.supersedes ?? [],
    evidenceRefs: pattern.evidenceRefs ?? [],
  };
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="rounded-md border border-border bg-muted/10 p-3">
        {children}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-1 text-sm md:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="break-all text-foreground">{value}</span>
    </div>
  );
}

function formatEvidenceRef(record: MemoryMutationAuditRecord['evidenceRefs'][number]) {
  const parts: string[] = [record.actionCategory];
  if (record.authorizationEventId) {
    parts.push(`auth=${record.authorizationEventId.slice(0, 8)}`);
  }
  if (record.completionEventId) {
    parts.push(`completion=${record.completionEventId.slice(0, 8)}`);
  }
  if (record.verificationReportId) {
    parts.push(`report=${record.verificationReportId.slice(0, 8)}`);
  }
  return parts.join(' ');
}
