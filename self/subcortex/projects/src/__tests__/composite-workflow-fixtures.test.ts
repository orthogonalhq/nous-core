import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { validateWorkflowSpec } from '@nous/shared';
import { loadInstalledWorkflowPackage } from '../package-store/document-loader.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createInstanceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nous-workflow-fixtures-'));
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

const fixtures = [
  {
    packageId: 'simple-linear',
    sourceSegments: ['self', 'shared', 'examples', 'workflows', 'simple-linear'],
    system: false,
    expectedNodes: 3,
    expectedConnections: 2,
    expectedContracts: [] as string[],
    expectedTemplates: [] as string[],
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
    expectedConnections: 5,
    expectedContracts: ['gate-exit'],
    expectedTemplates: [] as string[],
  },
  {
    packageId: 'parallel-execution',
    sourceSegments: ['self', 'shared', 'examples', 'workflows', 'parallel-execution'],
    system: false,
    expectedNodes: 6,
    expectedConnections: 7,
    expectedContracts: [] as string[],
    expectedTemplates: ['summary-report'],
  },
] as const;

describe('composite workflow package fixtures', () => {
  const runtime = new NodeRuntime();

  it.each(fixtures)(
    'loads $packageId through the composite package loader',
    async ({
      packageId,
      sourceSegments,
      system,
      expectedNodes,
      expectedConnections,
      expectedContracts,
      expectedTemplates,
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
      expect(loaded.flowRef).toBeUndefined();
      expect(loaded.topology?.nodes).toHaveLength(expectedNodes);
      expect(loaded.topology?.connections).toHaveLength(expectedConnections);
      expect(Object.keys(loaded.nodeContent ?? {})).toHaveLength(expectedNodes);
      expect(Object.keys(loaded.contracts ?? {}).sort()).toEqual(
        [...expectedContracts].sort(),
      );
      expect(Object.keys(loaded.templates ?? {}).sort()).toEqual(
        [...expectedTemplates].sort(),
      );

      const validation = validateWorkflowSpec(loaded.topology, { deep: true });
      expect(validation.success).toBe(true);
    },
  );

  it('loads contract and template bindings from the real fixture packages', async () => {
    const instanceRoot = await createInstanceRoot();
    await stageWorkflowPackage({
      instanceRoot,
      packageId: 'branching-conditional',
      sourceSegments: [
        'self',
        'shared',
        'examples',
        'workflows',
        'branching-conditional',
      ],
    });
    await stageWorkflowPackage({
      instanceRoot,
      packageId: 'parallel-execution',
      sourceSegments: ['self', 'shared', 'examples', 'workflows', 'parallel-execution'],
    });

    const branching = await loadInstalledWorkflowPackage({
      instanceRoot,
      runtime,
      packageId: 'branching-conditional',
    });
    const parallel = await loadInstalledWorkflowPackage({
      instanceRoot,
      runtime,
      packageId: 'parallel-execution',
    });

    expect(branching.nodeContent?.['check-condition']?.frontmatter.nous.contracts).toEqual([
      'gate-exit',
    ]);
    expect(branching.contracts?.['gate-exit']?.frontmatter.scope).toBe('per-node');

    expect(parallel.nodeContent?.['output-report']?.frontmatter.nous.templates).toEqual([
      'summary-report',
    ]);
    expect(parallel.templates?.['summary-report']?.frontmatter.template).toBe(
      'summary-report',
    );
  });
});
