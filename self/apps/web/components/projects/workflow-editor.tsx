'use client';

import * as React from 'react';
import type {
  ProjectWorkflowSurfaceSnapshot,
  WorkflowDefinition,
  WorkflowDefinitionValidationResult,
  WorkflowNodeDefinition,
} from '@nous/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(16).slice(2)}`;
}

function createNodeId(): WorkflowNodeDefinition['id'] {
  return createId() as WorkflowNodeDefinition['id'];
}

function createEdgeId(): WorkflowDefinition['edges'][number]['id'] {
  return createId() as WorkflowDefinition['edges'][number]['id'];
}

function asEntryNodeIds(
  ids: WorkflowNodeDefinition['id'][],
): WorkflowDefinition['entryNodeIds'] {
  return ids as WorkflowDefinition['entryNodeIds'];
}

function createNode(
  type: WorkflowDefinition['nodes'][number]['type'] = 'model-call',
): WorkflowDefinition['nodes'][number] {
  const id = createNodeId();
  const base = {
    id,
    name: `New ${type}`,
    type,
    governance: 'must' as const,
    executionModel: 'synchronous' as const,
  };

  switch (type) {
    case 'tool-execution':
      return {
        ...base,
        config: {
          type,
          toolName: 'echo',
          inputMappingRef: 'mapping://input',
        },
      };
    case 'condition':
      return {
        ...base,
        config: {
          type,
          predicateRef: 'predicate://condition',
          trueBranchKey: 'true',
          falseBranchKey: 'false',
        },
      };
    case 'transform':
      return {
        ...base,
        config: {
          type,
          transformRef: 'transform://normalize',
          inputMappingRef: 'mapping://input',
        },
      };
    case 'quality-gate':
      return {
        ...base,
        config: {
          type,
          evaluatorRef: 'evaluator://quality',
          passThresholdRef: 'threshold://default',
          failureAction: 'block' as const,
        },
      };
    case 'human-decision':
      return {
        ...base,
        config: {
          type,
          decisionRef: 'decision://review',
          timeoutMs: 300000,
          defaultOnTimeout: 'halt' as const,
        },
      };
    case 'subworkflow':
      return {
        ...base,
        config: {
          type,
        },
      };
    case 'model-call':
    default:
      return {
        ...base,
        type: 'model-call' as const,
        config: {
          type: 'model-call' as const,
          modelRole: 'reasoner' as const,
          promptRef: 'prompt://draft',
        },
      };
  }
}

function createStarterDefinition(
  projectId: string,
  projectType: 'protocol' | 'intent' | 'hybrid',
): WorkflowDefinition {
  const node = createNode();
  return {
    id: createId() as WorkflowDefinition['id'],
    projectId: projectId as WorkflowDefinition['projectId'],
    mode: projectType === 'protocol' ? 'protocol' : 'hybrid',
    version: '1.0.0',
    name: `${projectType} workflow`,
    entryNodeIds: asEntryNodeIds([node.id]),
    nodes: [node] as WorkflowDefinition['nodes'],
    edges: [],
  };
}

function replaceNode(
  definition: WorkflowDefinition,
  nodeId: WorkflowNodeDefinition['id'],
  update: (node: WorkflowDefinition['nodes'][number]) => WorkflowDefinition['nodes'][number],
) {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => (node.id === nodeId ? update(node) : node)),
  };
}

interface WorkflowEditorProps {
  projectId: string;
  projectType: 'protocol' | 'intent' | 'hybrid';
  snapshot: ProjectWorkflowSurfaceSnapshot;
}

export function WorkflowEditor({
  projectId,
  projectType,
  snapshot,
}: WorkflowEditorProps) {
  const [draft, setDraft] = React.useState<WorkflowDefinition | null>(
    snapshot.workflowDefinition,
  );
  const [selectedNodeId, setSelectedNodeId] = React.useState<WorkflowNodeDefinition['id'] | null>(
    snapshot.workflowDefinition?.nodes[0]?.id ?? null,
  );
  const [validation, setValidation] = React.useState<WorkflowDefinitionValidationResult | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const utils = trpc.useUtils();
  const validateDraft = trpc.projects.validateWorkflowDefinition.useMutation();
  const saveDraft = trpc.projects.saveWorkflowDefinition.useMutation();

  React.useEffect(() => {
    setDraft(snapshot.workflowDefinition);
    setSelectedNodeId(snapshot.workflowDefinition?.nodes[0]?.id ?? null);
    setValidation(null);
  }, [snapshot.workflowDefinition]);

  const selectedNode = draft?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  async function runValidation() {
    if (!draft) {
      return;
    }
    const result = await validateDraft.mutateAsync({
      projectId,
      workflowDefinition: draft,
    });
    setValidation(result as WorkflowDefinitionValidationResult);
    setMessage(result.valid ? 'Workflow definition is valid.' : 'Validation failed.');
    return result;
  }

  async function handleSave() {
    if (!draft) {
      return;
    }
    const result = await runValidation();
    if (!result?.valid) {
      return;
    }

    await saveDraft.mutateAsync({
      projectId,
      workflowDefinition: draft,
      setAsDefault: true,
    });
    await utils.projects.workflowSnapshot.invalidate();
    setMessage('Workflow definition saved.');
  }

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Basic editor</span>
          <div className="flex gap-2">
            {!draft ? (
              <Button onClick={() => setDraft(createStarterDefinition(projectId, projectType))}>
                Create starter workflow
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDraft(snapshot.workflowDefinition)}>
                  Reset
                </Button>
                <Button variant="outline" onClick={() => void runValidation()}>
                  Validate draft
                </Button>
                <Button onClick={() => void handleSave()}>Save workflow</Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {!draft ? (
          <p className="text-sm text-muted-foreground">
            No canonical workflow definition is saved for this project yet.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Workflow name</span>
                <Input
                  aria-label="Workflow name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Version</span>
                <Input
                  aria-label="Workflow version"
                  value={draft.version}
                  onChange={(event) =>
                    setDraft({ ...draft, version: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Mode</span>
                <Select
                  aria-label="Workflow mode"
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      mode: event.target.value as WorkflowDefinition['mode'],
                    })
                  }
                >
                  <option value="protocol">protocol</option>
                  <option value="hybrid">hybrid</option>
                </Select>
              </label>
            </div>

            <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Nodes</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const node = createNode();
                      const nextDraft: WorkflowDefinition = {
                        ...draft,
                        entryNodeIds:
                          draft.nodes.length === 0
                            ? asEntryNodeIds([node.id])
                            : draft.entryNodeIds,
                        nodes: [...draft.nodes, node] as WorkflowDefinition['nodes'],
                      };
                      setDraft(nextDraft);
                      setSelectedNodeId(node.id);
                    }}
                  >
                    Add node
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        selectedNodeId === node.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/20'
                      }`}
                    >
                      <div className="font-medium">{node.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {node.type} • {draft.entryNodeIds.includes(node.id) ? 'entry' : 'node'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium">Edges</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (draft.nodes.length < 2) {
                          setMessage('Add at least two nodes before creating an edge.');
                          return;
                        }
                        setDraft({
                          ...draft,
                          edges: [
                            ...draft.edges,
                            {
                              id: createEdgeId(),
                              from: draft.nodes[0]!.id,
                              to: draft.nodes[draft.nodes.length - 1]!.id,
                              priority: 0,
                            },
                          ],
                        });
                      }}
                    >
                      Add edge
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {draft.edges.map((edge) => (
                      <div key={edge.id} className="rounded border border-border px-2 py-2 text-xs">
                        <div>{edge.from.slice(0, 8)}... → {edge.to.slice(0, 8)}...</div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <Input
                            aria-label={`Edge ${edge.id} from`}
                            value={edge.from}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                edges: draft.edges.map((candidate) =>
                                  candidate.id === edge.id
                                    ? { ...candidate, from: event.target.value as any }
                                    : candidate,
                                ),
                              })
                            }
                          />
                          <Input
                            aria-label={`Edge ${edge.id} to`}
                            value={edge.to}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                edges: draft.edges.map((candidate) =>
                                  candidate.id === edge.id
                                    ? { ...candidate, to: event.target.value as any }
                                    : candidate,
                                ),
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {selectedNode ? (
                  <div className="space-y-4 rounded-md border border-border p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Node name</span>
                        <Input
                          aria-label="Node name"
                          value={selectedNode.name}
                          onChange={(event) =>
                            setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                              ...node,
                              name: event.target.value,
                            })))
                          }
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Node type</span>
                        <Select
                          aria-label="Node type"
                          value={selectedNode.type}
                          onChange={(event) => {
                            const nextNode = createNode(
                              event.target.value as WorkflowDefinition['nodes'][number]['type'],
                            );
                            setDraft(
                              replaceNode(draft, selectedNode.id, () => ({
                                ...nextNode,
                                id: selectedNode.id,
                                name: selectedNode.name,
                              })),
                            );
                          }}
                        >
                          <option value="model-call">model-call</option>
                          <option value="tool-execution">tool-execution</option>
                          <option value="condition">condition</option>
                          <option value="transform">transform</option>
                          <option value="quality-gate">quality-gate</option>
                          <option value="human-decision">human-decision</option>
                          <option value="subworkflow">subworkflow</option>
                        </Select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Governance</span>
                        <Select
                          aria-label="Node governance"
                          value={selectedNode.governance}
                          onChange={(event) =>
                            setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                              ...node,
                              governance: event.target.value as any,
                            })))
                          }
                        >
                          <option value="must">must</option>
                          <option value="should">should</option>
                          <option value="may">may</option>
                        </Select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Execution model</span>
                        <Select
                          aria-label="Node execution model"
                          value={selectedNode.executionModel}
                          onChange={(event) =>
                            setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                              ...node,
                              executionModel: event.target.value as any,
                            })))
                          }
                        >
                          <option value="synchronous">synchronous</option>
                          <option value="asynchronous">asynchronous</option>
                        </Select>
                      </label>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.entryNodeIds.includes(selectedNode.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            entryNodeIds: event.target.checked
                              ? asEntryNodeIds([
                                  ...new Set([...draft.entryNodeIds, selectedNode.id]),
                                ])
                              : asEntryNodeIds(
                                  draft.entryNodeIds.filter((id) => id !== selectedNode.id),
                                ),
                          })
                        }
                      />
                      <span>Entry node</span>
                    </label>

                    {selectedNode.config.type === 'model-call' ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Model role</span>
                          <Select
                            aria-label="Model role"
                            value={selectedNode.config.modelRole}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  modelRole: event.target.value as any,
                                },
                              })))
                            }
                          >
                            <option value="reasoner">reasoner</option>
                            <option value="planner">planner</option>
                            <option value="critic">critic</option>
                            <option value="summarizer">summarizer</option>
                          </Select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Prompt ref</span>
                          <Input
                            aria-label="Prompt ref"
                            value={selectedNode.config.promptRef}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  promptRef: event.target.value,
                                },
                              })))
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedNode.config.type === 'tool-execution' ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Tool name</span>
                          <Input
                            aria-label="Tool name"
                            value={selectedNode.config.toolName}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  toolName: event.target.value,
                                },
                              })))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Input mapping ref</span>
                          <Input
                            aria-label="Input mapping ref"
                            value={selectedNode.config.inputMappingRef}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  inputMappingRef: event.target.value,
                                },
                              })))
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedNode.config.type === 'quality-gate' ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Evaluator ref</span>
                          <Input
                            aria-label="Evaluator ref"
                            value={selectedNode.config.evaluatorRef}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  evaluatorRef: event.target.value,
                                },
                              })))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Pass threshold ref</span>
                          <Input
                            aria-label="Pass threshold ref"
                            value={selectedNode.config.passThresholdRef}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  passThresholdRef: event.target.value,
                                },
                              })))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Failure action</span>
                          <Select
                            aria-label="Failure action"
                            value={selectedNode.config.failureAction}
                            onChange={(event) =>
                              setDraft(replaceNode(draft, selectedNode.id, (node) => ({
                                ...node,
                                config: {
                                  ...node.config,
                                  failureAction: event.target.value as any,
                                },
                              })))
                            }
                          >
                            <option value="block">block</option>
                            <option value="reprompt">reprompt</option>
                            <option value="rollback">rollback</option>
                          </Select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a node to edit its configuration.
                  </p>
                )}

                {message ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                    {message}
                  </div>
                ) : null}

                {validation?.issues.length ? (
                  <div className="rounded-md border border-border p-3">
                    <h3 className="font-medium">Validation issues</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {validation.issues.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          {issue.code}: {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
