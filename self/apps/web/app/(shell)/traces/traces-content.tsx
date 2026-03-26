'use client'

import { trpc } from '@/lib/trpc'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'

export interface TracesContentProps {
  projectId: string | null
  traceId?: string | null
}

function shortId(id: string): string {
  if (id.length <= 14) {
    return id
  }
  return `${id.slice(0, 8)}...${id.slice(-6)}`
}

export function TracesContent({ projectId, traceId = null }: TracesContentProps) {
  const selectedTraceId = traceId ?? null
  const { data: traces, isLoading } = trpc.traces.list.useQuery(
    { projectId: projectId ?? undefined, limit: 50 },
    { enabled: !!projectId },
  )

  if (!projectId) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-4xl)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          Select a project from the navigation panel to view traces.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--nous-space-4xl)' }}>
        <p style={{ color: 'var(--nous-text-secondary)' }}>Loading traces...</p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-2xl)',
        padding: 'var(--nous-space-4xl)',
      }}
    >
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 'var(--nous-font-weight-semibold)',
        }}
      >
        Execution Traces
      </h1>
      {selectedTraceId ? (
        <p
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Linked trace reference: {selectedTraceId.slice(0, 8)}...
        </p>
      ) : null}
      {!traces?.length ? (
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          No traces yet. Send a message in Chat to create one.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--nous-space-2xl)',
          }}
        >
          {(traces ?? []).map((trace) => (
            <Card key={trace.traceId}>
              <Collapsible defaultOpen={trace.traceId === selectedTraceId}>
                <CardHeader
                  style={{
                    paddingTop: 'var(--nous-space-xl)',
                    paddingBottom: 'var(--nous-space-xl)',
                  }}
                >
                  <CollapsibleTrigger
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                    }}
                  >
                    <CardTitle
                      style={{
                        fontSize: 'var(--nous-font-size-sm)',
                        fontWeight: 'var(--nous-font-weight-medium)',
                      }}
                    >
                      {trace.traceId.slice(0, 8)}...
                    </CardTitle>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--nous-space-md)',
                      }}
                    >
                      <Badge variant="outline">
                        {trace.turns.length} turn{trace.turns.length !== 1 ? 's' : ''}
                      </Badge>
                      <span
                        style={{
                          fontSize: 'var(--nous-font-size-xs)',
                          color: 'var(--nous-text-secondary)',
                        }}
                      >
                        {trace.startedAt}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--nous-space-2xl)',
                      borderTop: '1px solid var(--nous-shell-column-border)',
                      paddingTop: 'var(--nous-space-2xl)',
                    }}
                  >
                    {trace.turns.map((turn, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--nous-space-md)',
                          borderRadius: 'var(--nous-radius-sm)',
                          border: '1px solid var(--nous-shell-column-border)',
                          padding: 'var(--nous-space-xl)',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: 'var(--nous-font-size-xs)',
                              fontWeight: 'var(--nous-font-weight-medium)',
                              color: 'var(--nous-text-secondary)',
                            }}
                          >
                            Input:
                          </span>
                          <p
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: 'var(--nous-font-size-sm)',
                            }}
                          >
                            {turn.input}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: 'var(--nous-font-size-xs)',
                              fontWeight: 'var(--nous-font-weight-medium)',
                              color: 'var(--nous-text-secondary)',
                            }}
                          >
                            Output:
                          </span>
                          <p
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: 'var(--nous-font-size-sm)',
                            }}
                          >
                            {turn.output}
                          </p>
                        </div>
                        {turn.modelCalls?.length ? (
                          <div>
                            <span
                              style={{
                                fontSize: 'var(--nous-font-size-xs)',
                                fontWeight: 'var(--nous-font-weight-medium)',
                                color: 'var(--nous-text-secondary)',
                              }}
                            >
                              Model calls:
                            </span>
                            <ul
                              style={{
                                listStylePosition: 'inside',
                                listStyleType: 'disc',
                                fontSize: 'var(--nous-font-size-sm)',
                              }}
                            >
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
                            <span
                              style={{
                                fontSize: 'var(--nous-font-size-xs)',
                                fontWeight: 'var(--nous-font-weight-medium)',
                                color: 'var(--nous-text-secondary)',
                              }}
                            >
                              Cortex decisions:
                            </span>
                            <ul
                              style={{
                                listStylePosition: 'inside',
                                listStyleType: 'disc',
                                fontSize: 'var(--nous-font-size-sm)',
                              }}
                            >
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
                            <span
                              style={{
                                fontSize: 'var(--nous-font-size-xs)',
                                fontWeight: 'var(--nous-font-weight-medium)',
                                color: 'var(--nous-text-secondary)',
                              }}
                            >
                              Memory writes:
                            </span>
                            <p style={{ fontSize: 'var(--nous-font-size-sm)' }}>
                              {turn.memoryWrites.length} approved
                            </p>
                          </div>
                        ) : null}
                        {turn.memoryDenials?.length ? (
                          <div>
                            <span
                              style={{
                                fontSize: 'var(--nous-font-size-xs)',
                                fontWeight: 'var(--nous-font-weight-medium)',
                                color: 'var(--nous-text-secondary)',
                              }}
                            >
                              Memory denials:
                            </span>
                            <ul
                              style={{
                                listStylePosition: 'inside',
                                listStyleType: 'disc',
                                fontSize: 'var(--nous-font-size-sm)',
                              }}
                            >
                              {turn.memoryDenials.map((d, j) => (
                                <li key={j}>{d.reason}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {turn.evidenceRefs?.length ? (
                          <div>
                            <span
                              style={{
                                fontSize: 'var(--nous-font-size-xs)',
                                fontWeight: 'var(--nous-font-weight-medium)',
                                color: 'var(--nous-text-secondary)',
                              }}
                            >
                              Evidence references:
                            </span>
                            <ul
                              style={{
                                listStylePosition: 'inside',
                                listStyleType: 'disc',
                                fontSize: 'var(--nous-font-size-sm)',
                              }}
                            >
                              {turn.evidenceRefs.map((ref, j) => (
                                <li key={j}>
                                  <code>{ref.actionCategory}</code>
                                  {ref.authorizationEventId ? ` auth=${shortId(ref.authorizationEventId)}` : ''}
                                  {ref.completionEventId ? ` completion=${shortId(ref.completionEventId)}` : ''}
                                  {ref.invariantEventId ? ` invariant=${shortId(ref.invariantEventId)}` : ''}
                                  {ref.verificationReportId ? ` report=${shortId(ref.verificationReportId)}` : ''}
                                </li>
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
  )
}
