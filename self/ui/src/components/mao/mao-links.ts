import type { MaoSurfaceLink } from '@nous/shared';

export type SearchParamReader = {
  get: (name: string) => string | null;
};

type SurfaceTarget = MaoSurfaceLink['target'];

export interface SurfaceLinkLike {
  target: SurfaceTarget;
  projectId: string;
  workflowRunId?: string | null;
  nodeDefinitionId?: string | null;
  artifactRef?: string | null;
  traceId?: string | null;
  evidenceRef?: string | null;
}

export interface MaoNavigationContext {
  source: 'mao';
  projectId: string | null;
  runId: string | null;
  nodeId: string | null;
  agentId: string | null;
  evidenceRef: string | null;
  reasoningRef: string | null;
}

export function formatShortId(value?: string | null, width = 8): string {
  if (!value) {
    return 'n/a';
  }

  return value.length <= width ? value : `${value.slice(0, width)}...`;
}

export function readMaoNavigationContext(
  searchParams: SearchParamReader,
): MaoNavigationContext | null {
  if (searchParams.get('source') !== 'mao') {
    return null;
  }

  return {
    source: 'mao',
    projectId: searchParams.get('projectId'),
    runId: searchParams.get('runId'),
    nodeId: searchParams.get('nodeId'),
    agentId: searchParams.get('agentId'),
    evidenceRef: searchParams.get('evidenceRef'),
    reasoningRef: searchParams.get('reasoningRef'),
  };
}

export function buildMaoReturnHref(
  context: MaoNavigationContext | null | undefined,
): string {
  const params = new URLSearchParams();
  if (context?.projectId) {
    params.set('projectId', context.projectId);
  }
  if (context?.runId) {
    params.set('runId', context.runId);
  }
  if (context?.nodeId) {
    params.set('nodeId', context.nodeId);
  }
  if (context?.agentId) {
    params.set('agentId', context.agentId);
  }
  if (context?.evidenceRef) {
    params.set('evidenceRef', context.evidenceRef);
  }
  if (context?.reasoningRef) {
    params.set('reasoningRef', context.reasoningRef);
  }

  const query = params.toString();
  return query ? `/mao?${query}` : '/mao';
}

export function buildMaoSurfaceHref(
  link: SurfaceLinkLike,
  options?: {
    agentId?: string | null;
    evidenceRef?: string | null;
    reasoningRef?: string | null;
  },
): string | null {
  const params = new URLSearchParams();
  params.set('source', 'mao');
  params.set('projectId', link.projectId);

  if (link.workflowRunId) {
    params.set('runId', link.workflowRunId);
  }
  if (link.nodeDefinitionId) {
    params.set('nodeId', link.nodeDefinitionId);
  }
  if (link.traceId) {
    params.set('traceId', link.traceId);
  }
  if (options?.agentId) {
    params.set('agentId', options.agentId);
  }
  if (options?.evidenceRef ?? link.evidenceRef) {
    params.set('evidenceRef', options?.evidenceRef ?? link.evidenceRef ?? '');
  }
  if (options?.reasoningRef) {
    params.set('reasoningRef', options.reasoningRef);
  }

  switch (link.target) {
    case 'chat':
      return `/chat?${params.toString()}`;
    case 'projects':
      return `/projects?${params.toString()}`;
    case 'mobile':
      return `/mobile?${params.toString()}`;
    case 'traces':
      return `/traces?${params.toString()}`;
    case 'mao':
      return `/mao?${params.toString()}`;
    case 'artifact':
    default:
      return null;
  }
}
