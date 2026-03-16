import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { ProjectConfigSchema } from '@nous/shared';
import {
  loadCompositeSkillDependencyGraph,
  loadInstalledSkillPackage,
  loadInstalledWorkflowPackage,
  resolveInstalledWorkflowDefinition,
} from '../package-store/document-loader.js';

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createInstanceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nous-phase-14.3-'));
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

async function writeInstalledSkill(options: {
  instanceRoot: string;
  packageId: string;
  skillMd: string;
  flowYaml?: string;
  steps?: Record<string, string>;
  refs?: Record<string, string>;
  packageVersion?: string;
}) {
  const root = join(
    options.instanceRoot,
    '.skills',
    sanitizePackageId(options.packageId),
  );
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'SKILL.md'), options.skillMd);
  if (options.packageVersion) {
    await writeFile(
      join(root, '.nous-package.json'),
      JSON.stringify({ package_version: options.packageVersion }, null, 2),
    );
  }
  if (options.flowYaml) {
    await writeFile(join(root, 'nous.flow.yaml'), options.flowYaml);
  }
  if (options.steps) {
    await mkdir(join(root, 'steps'), { recursive: true });
    for (const [name, content] of Object.entries(options.steps)) {
      await writeFile(join(root, 'steps', name), content);
    }
  }
  if (options.refs) {
    await mkdir(join(root, 'references'), { recursive: true });
    for (const [name, content] of Object.entries(options.refs)) {
      await writeFile(join(root, 'references', name), content);
    }
  }
}

async function writeInstalledWorkflow(options: {
  instanceRoot: string;
  packageId: string;
  workflowMd: string;
  flowYaml: string;
  steps: Record<string, string>;
  packageVersion?: string;
}) {
  const root = join(
    options.instanceRoot,
    '.workflows',
    sanitizePackageId(options.packageId),
  );
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'WORKFLOW.md'), options.workflowMd);
  await writeFile(join(root, 'nous.flow.yaml'), options.flowYaml);
  await mkdir(join(root, 'steps'), { recursive: true });
  for (const [name, content] of Object.entries(options.steps)) {
    await writeFile(join(root, 'steps', name), content);
  }
  if (options.packageVersion) {
    await writeFile(
      join(root, '.nous-package.json'),
      JSON.stringify({ package_version: options.packageVersion }, null, 2),
    );
  }
}

describe('package document loading', () => {
  const runtime = new NodeRuntime();

  it('loads canonical atomic skill packages without legacy workflow-routing fields', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.atomic',
      packageVersion: '1.0.0',
      skillMd: `---
name: atomic-skill
description: Atomic skill package.
metadata:
  nous:
    owner: runtime
---

# Atomic Skill
`,
      refs: {
        'usage.md': '# usage',
      },
    });

    const loaded = await loadInstalledSkillPackage({
      instanceRoot,
      runtime,
      packageId: 'skill.atomic',
    });

    expect(loaded.kind).toBe('atomic');
    expect(loaded.packageVersion).toBe('1.0.0');
    expect(loaded.resourceRefs.references).toEqual(['references/usage.md']);
  });

  it('stages composite constituent loading separately and rejects dependency cycles', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.composite',
      skillMd: `---
name: composite-skill
description: Composite skill package.
dependencies:
  skills:
    - name: skill.atomic-a
metadata:
  nous:
    skill-tier: composite
---

# Composite Skill
`,
    });
    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.atomic-a',
      skillMd: `---
name: atomic-a
description: Atomic A.
---

# Atomic A
`,
    });

    const rootOnly = await loadInstalledSkillPackage({
      instanceRoot,
      runtime,
      packageId: 'skill.composite',
    });
    expect(rootOnly.kind).toBe('composite');

    const graph = await loadCompositeSkillDependencyGraph({
      instanceRoot,
      runtime,
      packageId: 'skill.composite',
    });
    expect(graph.rootPackage.packageId).toBe('skill.composite');
    expect(Object.keys(graph.packages).sort()).toEqual([
      'skill.atomic-a',
      'skill.composite',
    ]);

    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.cycle-a',
      skillMd: `---
name: cycle-a
description: Cycle A.
dependencies:
  skills:
    - name: skill.cycle-b
metadata:
  nous:
    skill-tier: composite
---
`,
    });
    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.cycle-b',
      skillMd: `---
name: cycle-b
description: Cycle B.
dependencies:
  skills:
    - name: skill.cycle-a
metadata:
  nous:
    skill-tier: composite
---
`,
    });

    await expect(
      loadCompositeSkillDependencyGraph({
        instanceRoot,
        runtime,
        packageId: 'skill.cycle-a',
      }),
    ).rejects.toThrow(/cycle/i);
  });

  it('loads workflow packages and resolves installed bindings into workflow definitions', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledWorkflow({
      instanceRoot,
      packageId: 'workflow.research',
      packageVersion: '2.0.0',
      workflowMd: `---
name: research-workflow
description: Workflow package manifest.
entrypoint: draft
---

# Workflow
`,
      flowYaml: `nous:
  v: 1
flow:
  id: research-workflow
  mode: graph
  entry_step: draft
  steps:
    - id: draft
      file: steps/draft.md
      next: ["review"]
    - id: review
      file: steps/review.md
      next: []
`,
      steps: {
        'draft.md': `---
nous:
  v: 1
  kind: workflow_step
  id: draft
name: Draft
type: model-call
governance: must
executionModel: synchronous
config:
  type: model-call
  modelRole: reasoner
  promptRef: prompt://draft
---

# Draft
`,
        'review.md': `---
nous:
  v: 1
  kind: workflow_step
  id: review
name: Review
type: quality-gate
governance: must
executionModel: synchronous
config:
  type: quality-gate
  evaluatorRef: evaluator://quality
  passThresholdRef: threshold://default
  failureAction: block
---

# Review
`,
      },
    });

    const loaded = await loadInstalledWorkflowPackage({
      instanceRoot,
      runtime,
      packageId: 'workflow.research',
    });
    expect(loaded.steps).toHaveLength(2);

    const projectConfig = ProjectConfigSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440401',
      name: 'Workflow Binding Project',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      escalationChannels: ['in-app'],
      workflow: {
        definitions: [],
        packageBindings: [
          {
            workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440402',
            workflowPackageId: 'workflow.research',
            workflowPackageVersion: '2.0.0',
            entrypoint: 'draft',
            boundAt: '2026-03-16T18:00:00.000Z',
            manifestRef: '.workflows/workflow__research/WORKFLOW.md',
          },
        ],
        defaultWorkflowDefinitionId: '550e8400-e29b-41d4-a716-446655440402',
      },
      retrievalBudgetTokens: 500,
      createdAt: '2026-03-16T18:00:00.000Z',
      updatedAt: '2026-03-16T18:00:00.000Z',
    });

    const resolved = await resolveInstalledWorkflowDefinition({
      instanceRoot,
      runtime,
      projectConfig,
      binding: projectConfig.workflow!.packageBindings[0]!,
    });

    expect(resolved.definition.id).toBe(
      '550e8400-e29b-41d4-a716-446655440402',
    );
    expect(resolved.definition.entryNodeIds).toHaveLength(1);
    expect(resolved.definition.entryNodeIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resolved.source.sourceKind).toBe('installed_package');
  });

  it('rejects workflow packages whose step frontmatter ids do not match flow ids', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledWorkflow({
      instanceRoot,
      packageId: 'workflow.mismatch',
      workflowMd: `---
name: mismatch-workflow
description: Workflow package manifest.
entrypoint: draft
---
`,
      flowYaml: `nous:
  v: 1
flow:
  id: mismatch-workflow
  mode: graph
  entry_step: draft
  steps:
    - id: draft
      file: steps/draft.md
      next: []
`,
      steps: {
        'draft.md': `---
nous:
  v: 1
  kind: workflow_step
  id: different-id
name: Draft
type: model-call
governance: must
executionModel: synchronous
config:
  type: model-call
  modelRole: reasoner
  promptRef: prompt://draft
---
`,
      },
    });

    await expect(
      loadInstalledWorkflowPackage({
        instanceRoot,
        runtime,
        packageId: 'workflow.mismatch',
      }),
    ).rejects.toThrow(/mismatch/i);
  });

  it('classifies legacy hybrid skills explicitly and exposes compatibility refs', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledSkill({
      instanceRoot,
      packageId: 'skill.legacy',
      skillMd: `---
name: legacy-skill
description: Legacy hybrid skill package.
skill_slug: legacy-skill
entrypoint_mode_slug: default
---

# Legacy Skill
`,
      flowYaml: `nous:
  v: 1
flow:
  id: legacy-skill
  mode: graph
  entry_step: start
  steps:
    - id: start
      file: steps/start.md
      next: []
`,
      steps: {
        'start.md': `---
nous:
  v: 1
  kind: skill_step
  id: start
---

# Start
`,
      },
    });

    const loaded = await loadInstalledSkillPackage({
      instanceRoot,
      runtime,
      packageId: 'skill.legacy',
    });

    expect(loaded.kind).toBe('legacy_hybrid');
    expect(loaded.legacyWorkflowRefs?.flowRef).toBe('nous.flow.yaml');
    expect(loaded.legacyWorkflowRefs?.stepRefs).toEqual(['steps/start.md']);
  });
});
