'use client';

import { useProject } from '@/lib/project-context';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

export default function TracesPage() {
  const { projectId } = useProject();
  const { data: traces, isLoading } = trpc.traces.list.useQuery(
    { projectId: projectId ?? undefined, limit: 50 },
    { enabled: !!projectId },
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the sidebar to view traces.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading traces...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Execution Traces</h1>
      {!traces?.length ? (
        <p className="text-muted-foreground">No traces yet. Send a message in Chat to create one.</p>
      ) : (
        <div className="space-y-4">
          {(traces ?? []).map((trace) => (
            <Card key={trace.traceId}>
              <Collapsible defaultOpen={false}>
                <CardHeader className="py-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                    <CardTitle className="text-sm font-medium">
                      {trace.traceId.slice(0, 8)}...
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {trace.turns.length} turn{trace.turns.length !== 1 ? 's' : ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {trace.startedAt}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4 border-t border-border pt-4">
                    {trace.turns.map((turn, i) => (
                      <div key={i} className="space-y-2 rounded border border-border p-3">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Input:</span>
                          <p className="whitespace-pre-wrap text-sm">{turn.input}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Output:</span>
                          <p className="whitespace-pre-wrap text-sm">{turn.output}</p>
                        </div>
                        {turn.modelCalls?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">Model calls:</span>
                            <ul className="list-inside list-disc text-sm">
                              {turn.modelCalls.map((mc, j) => (
                                <li key={j}>
                                  {mc.providerId} / {mc.role}
                                  {mc.durationMs != null && ` (${mc.durationMs}ms)`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {turn.pfcDecisions?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">PFC decisions:</span>
                            <ul className="list-inside list-disc text-sm">
                              {turn.pfcDecisions.map((d, j) => (
                                <li key={j}>
                                  {d.approved ? 'Approved' : 'Denied'}: {d.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {turn.memoryWrites?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">Memory writes:</span>
                            <p className="text-sm">{turn.memoryWrites.length} approved</p>
                          </div>
                        ) : null}
                        {turn.memoryDenials?.length ? (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">Memory denials:</span>
                            <ul className="list-inside list-disc text-sm">
                              {turn.memoryDenials.map((d, j) => (
                                <li key={j}>{d.reason}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
