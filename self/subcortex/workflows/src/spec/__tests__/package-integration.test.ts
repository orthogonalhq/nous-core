import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { validateWorkflowSpec } from '@nous/shared';
import { loadInstalledWorkflowPackage } from '@nous/subcortex-projects';
import {
  specToExecutionGraph,
  specToWorkflowDefinition,
  type NodeEnrichmentData,
} from '../index.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createInstanceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nous-workflow-graph-'));
  tempRoots.push(root);
  await Promise.all([
    mkdir(join(root, '.skills'), { recursive: true }),
    mkdir(join(root, '.workflows'), { recursive: true }),
    mkdir(join(root, '.apps'), { recursive: true }),
    mkdir(join(root, '.projects'), { recursive: true }),
    mkdir(join(root, '.contracts'), { recursive: true }),
  ]);
  return root;
}

async function stageWorkflowPackage(options: {
  instanceRoot: string;
  packageId: string;
  sourceSegments: string[];
  system?: boolean;
}) {
  const sourcePath = resolve(repoRoot, ...options.sourceSegments);
  const targetPath = join(
    options.instanceRoot,
    '.workflows',
    ...(options.system ? ['.system'] : []),
    sanitizePackageId(options.packageId),
  );
  await mkdir(join(options.instanceRoot, '.workflows', ...(options.system ? ['.system'] : [])), {
    recursive: true,
  });
  await cp(sourcePath, targetPath, { recursive: true });
}

function toEnrichmentMap(
  nodeContent: Record<
    string,
    {
      frontmatter: {
        nous: {
          skill?: string;
          contracts?: string[];
          templates?: string[];
        };
      };
      body: string;
    }
  >,
): Record<string, NodeEnrichmentData> {
  return Object.fromEntries(
    Object.entries(nodeContent).map(([nodeId, content]) => [
      nodeId,
      {
        skill: content.frontmatter.nous.skill,
        contracts: content.frontmatter.nous.contracts,
        templates: content.frontmatter.nous.templates,
        body: content.body,
      },
    ]),
  );
}

const fixtures = [
  {
    packageId: 'simple-linear',
    sourceSegments: ['self', 'shared', 'examples', 'workflows', 'simple-linear'],
    system: false,
    expectedNodes: 3,
    expectedEdges: 2,
    expectedEntryNodes: 1,
    expectGraphBuild: true,
  },
  {
    packageId: 'branching-conditional',
    sourceSegments: [
      'self',
      'shared',
      'examples',
      'workflows',
      'branching-conditional',
    ],
    system: false,
    expectedNodes: 5,
    expectedEdges: 5,
    expectedEntryNodes: 1,
    expectGraphBuild: true,
  },
  {
    packageId: 'parallel-execution',
    sourceSegments: ['self', 'shared', 'examples', 'workflows', 'parallel-execution'],
    system: false,
    expectedNodes: 6,
    expectedEdges: 7,
    expectedEntryNodes: 1,
    expectGraphBuild: true,
  },
  {
    packageId: 'a-soul-is-born',
    sourceSegments: ['.workflows', '.system', 'a-soul-is-born'],
    system: true,
    expectedNodes: 5,
    expectedEdges: 4,
    expectedEntryNodes: 1,
    expectGraphBuild: true,
  },
  {
    packageId: 'self-repair-orchestration-sop',
    sourceSegments: ['.workflows', '.system', 'self-repair-orchestration-sop'],
    system: true,
    expectedNodes: 13,
    expectedEdges: 17,
    expectedEntryNodes: 1,
    expectGraphBuild: false,
  },
] as const;

describe('repository workflow packages integrate with the runtime adapter', () => {
  const runtime = new NodeRuntime();
  const projectId = '00000000-0000-0000-0000-00000000feed';

  it.each(fixtures)(
    '$packageId loads, validates, and builds a derived workflow graph',
    async ({
      packageId,
      sourceSegments,
      system,
      expectedNodes,
      expectedEdges,
      expectedEntryNodes,
      expectGraphBuild = true,
    }) => {
      const instanceRoot = await createInstanceRoot();
      await stageWorkflowPackage({
        instanceRoot,
        packageId,
        sourceSegments: [...sourceSegments],
        system,
      });

      const loaded = await loadInstalledWorkflowPackage({
        instanceRoot,
        runtime,
        packageId,
      });

      expect(loaded.format).toBe('composite');

      const validation = validateWorkflowSpec(loaded.topology, { deep: true });
      expect(validation.success).toBe(true);

      const definition = specToWorkflowDefinition(loaded.topology!, {
        projectId,
        enrichment: toEnrichmentMap(loaded.nodeContent ?? {}),
      });
      expect(definition.nodes).toHaveLength(expectedNodes);
      expect(definition.edges).toHaveLength(expectedEdges);
      expect(definition.entryNodeIds).toHaveLength(expectedEntryNodes);

      if (expectGraphBuild) {
        const graph = specToExecutionGraph(loaded.topology!, {
          projectId,
          enrichment: toEnrichmentMap(loaded.nodeContent ?? {}),
        });
        expect(Object.keys(graph.nodes)).toHaveLength(expectedNodes);
        expect(Object.keys(graph.edges)).toHaveLength(expectedEdges);
        expect(graph.entryNodeIds).toHaveLength(expectedEntryNodes);
        expect(graph.topologicalOrder).toHaveLength(expectedNodes);
      }
    },
  );

  it('propagates package-level node enrichment into runtime node metadata', async () => {
    const instanceRoot = await createInstanceRoot();
    await stageWorkflowPackage({
      instanceRoot,
      packageId: 'parallel-execution',
      sourceSegments: ['self', 'shared', 'examples', 'workflows', 'parallel-execution'],
    });
    await stageWorkflowPackage({
      instanceRoot,
      packageId: 'self-repair-orchestration-sop',
      sourceSegments: ['.workflows', '.system', 'self-repair-orchestration-sop'],
      system: true,
    });

    const parallel = await loadInstalledWorkflowPackage({
      instanceRoot,
      runtime,
      packageId: 'parallel-execution',
    });
    const selfRepair = await loadInstalledWorkflowPackage({
      instanceRoot,
      runtime,
      packageId: 'self-repair-orchestration-sop',
    });

    const parallelDefinition = specToWorkflowDefinition(parallel.topology!, {
      projectId,
      enrichment: toEnrichmentMap(parallel.nodeContent ?? {}),
    });
    const selfRepairDefinition = specToWorkflowDefinition(selfRepair.topology!, {
      projectId,
      enrichment: toEnrichmentMap(selfRepair.nodeContent ?? {}),
    });

    const outputReportNode = parallelDefinition.nodes.find(
      (node) => node.metadata?.specNodeId === 'output-report',
    );
    expect(outputReportNode?.metadata).toEqual({
      specNodeId: 'output-report',
      skill: undefined,
      contracts: undefined,
      templates: ['summary-report'],
    });

    const approvalNode = selfRepairDefinition.nodes.find(
      (node) => node.metadata?.specNodeId === 'request-cortex-approval',
    );
    expect(approvalNode?.metadata).toEqual({
      specNodeId: 'request-cortex-approval',
      skill: 'self-repair-orchestration-sop',
      contracts: undefined,
      templates: ['pfc-approval-request-template', 'handoff-disposition-template'],
    });
  });
});
