import * as React from 'react';
import type {
  ConfidenceGovernanceEvaluationResult,
  ExperienceRecord,
  LearnedBehaviorExplanation,
  Phase6ConfidenceSignalExport,
  Phase6DistilledPatternExport,
  TraceEvidenceReference,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LearningPatternDetail {
  pattern: {
    id: string;
    content: string;
    confidence: number;
    provenance: {
      traceId?: string;
      source: string;
      timestamp: string;
    };
    tags: string[];
    createdAt: string;
    updatedAt: string;
    lifecycleStatus: string;
    basedOn: string[];
    supersedes: string[];
    evidenceRefs: TraceEvidenceReference[];
  };
  patternExport: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  sourceTimeline: ExperienceRecord[];
  lifecycleEvents: Array<{
    id: string;
    kind: string;
    label: string;
    at?: string;
    derived: true;
    relatedEntryId?: string;
  }>;
  decisionProjections: Array<{
    scenarioId: string;
    label: string;
    projectionBasis: 'representative' | 'current-control-state';
    explanation: LearnedBehaviorExplanation;
    evaluation: ConfidenceGovernanceEvaluationResult;
  }>;
  lineage: {
    supersededIds: string[];
    missingSourceIds: string[];
    rollbackVisibility: 'available' | 'retired' | 'degraded';
    lineageIntegrityStatus:
      | 'complete'
      | 'missing-sources'
      | 'missing-evidence'
      | 'mixed';
  };
  diagnostics: {
    projectControlState?: string;
    historicalDecisionLogAvailable: false;
    missingEvidenceRefs: boolean;
  };
}

interface MemoryLearningDetailProps {
  detail: LearningPatternDetail | null | undefined;
  isLoading: boolean;
}

export function MemoryLearningDetail({
  detail,
  isLoading,
}: MemoryLearningDetailProps) {
  return (
    <Card className="min-h-[24rem]">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Learning Detail</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading learning detail...
          </p>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">
            Select a distilled pattern to inspect source timelines, lineage, and
            representative governance projections.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{detail.confidenceSignal.tier}</Badge>
                <Badge variant="secondary">
                  {detail.confidenceSignal.decayState ?? 'derived'}
                </Badge>
                <Badge variant="outline">
                  {detail.lineage.lineageIntegrityStatus}
                </Badge>
                <Badge variant="outline">{detail.lineage.rollbackVisibility}</Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {detail.pattern.content}
              </p>
              <div className="rounded-md border border-border bg-muted/10 p-3 text-sm text-muted-foreground">
                <p>Lifecycle events below are derived from canonical timestamps and confidence configuration.</p>
                <p>Governance cards are representative projections over current canonical contracts, not persisted workflow-runtime history.</p>
                {!detail.diagnostics.historicalDecisionLogAvailable ? (
                  <p>Historical decision log persistence is not available in Phase 8.8.</p>
                ) : null}
                {detail.diagnostics.missingEvidenceRefs ? (
                  <p>Canonical pattern evidence references are incomplete; governance cards are withheld until evidence linkage is restored.</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DetailSection title="Confidence Snapshot">
                <DetailRow
                  label="Confidence"
                  value={detail.confidenceSignal.confidence.toFixed(2)}
                />
                <DetailRow label="Tier" value={detail.confidenceSignal.tier} />
                <DetailRow
                  label="Decay state"
                  value={detail.confidenceSignal.decayState ?? 'n/a'}
                />
                <DetailRow
                  label="Supporting signals"
                  value={String(detail.confidenceSignal.supportingSignals)}
                />
                <DetailRow
                  label="Updated"
                  value={formatDate(detail.pattern.updatedAt)}
                />
              </DetailSection>

              <DetailSection title="Lineage and Diagnostics">
                <DetailRow
                  label="Rollback"
                  value={detail.lineage.rollbackVisibility}
                />
                <DetailRow
                  label="Integrity"
                  value={detail.lineage.lineageIntegrityStatus}
                />
                <DetailRow
                  label="Supersedes"
                  value={detail.lineage.supersededIds.join(', ') || 'n/a'}
                />
                <DetailRow
                  label="Missing sources"
                  value={detail.lineage.missingSourceIds.join(', ') || 'none'}
                />
                <DetailRow
                  label="Control state"
                  value={detail.diagnostics.projectControlState ?? 'unavailable'}
                />
                <DetailRow
                  label="Pattern trace"
                  value={detail.pattern.provenance.traceId ?? 'unavailable'}
                />
              </DetailSection>
            </div>

            <DetailSection title="Evidence and Provenance">
              <DetailRow
                label="Evidence refs"
                value={
                  detail.pattern.evidenceRefs.length > 0
                    ? detail.pattern.evidenceRefs.map(formatEvidenceRef).join(', ')
                    : 'none'
                }
              />
              <DetailRow
                label="Based on"
                value={detail.pattern.basedOn.join(', ') || 'none'}
              />
              <DetailRow
                label="Source"
                value={detail.pattern.provenance.source}
              />
              <DetailRow
                label="Recorded"
                value={detail.pattern.provenance.timestamp}
              />
            </DetailSection>

            <DetailSection title="Experience Timeline">
              {detail.sourceTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No canonical source records are currently available for this
                  pattern.
                </p>
              ) : (
                <ScrollArea className="max-h-64 space-y-3">
                  <div className="space-y-3">
                    {detail.sourceTimeline.map((record) => (
                      <div
                        key={record.id}
                        className="rounded-md border border-border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{record.sentiment}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(record.updatedAt)}
                          </span>
                        </div>
                        <p className="mt-2 font-medium text-foreground">
                          {record.content}
                        </p>
                        <p className="mt-2 text-muted-foreground">
                          {record.context}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          action {record.action} {'->'} outcome {record.outcome}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          reason {record.reason} / trace{' '}
                          {record.provenance.traceId ?? 'unavailable'}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </DetailSection>

            <DetailSection title="Derived Lifecycle Events">
              <div className="space-y-3">
                {detail.lifecycleEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">derived</Badge>
                      <Badge variant="outline">{event.kind}</Badge>
                    </div>
                    <p className="mt-2 text-foreground">{event.label}</p>
                    {event.at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.at)}
                      </p>
                    ) : null}
                    {event.relatedEntryId ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        related entry {event.relatedEntryId}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </DetailSection>

            <DetailSection title="Representative Governance Cards">
              {detail.decisionProjections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Governance projections are unavailable until the pattern has
                  canonical evidence linkage.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.decisionProjections.map((projection) => (
                    <div
                      key={projection.scenarioId}
                      className="rounded-md border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{projection.scenarioId}</Badge>
                        <Badge variant="secondary">
                          {projection.evaluation.reasonCode}
                        </Badge>
                        <Badge variant="outline">
                          {projection.projectionBasis}
                        </Badge>
                      </div>
                      <p className="mt-2 font-medium text-foreground">
                        {projection.label}
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        outcome {projection.evaluation.outcome} / governance{' '}
                        {projection.evaluation.governance}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        confidence {projection.evaluation.confidence.toFixed(2)} / tier{' '}
                        {projection.evaluation.confidenceTier}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        explanation ref {projection.explanation.outcomeRef}
                      </p>
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

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatEvidenceRef(ref: TraceEvidenceReference): string {
  return ref.actionCategory;
}
