import { describe, expect, it } from 'vitest';
import {
  AtomicSkillFrontmatterSchema,
  CompositeSkillFrontmatterSchema,
  LoadedAppPackageSchema,
  LoadedWorkflowPackageSchema,
  ProjectWorkflowPackageBindingSchema,
  ResolvedWorkflowDefinitionSourceSchema,
  WorkflowFlowDocumentSchema,
  WorkflowManifestFrontmatterSchema,
  WorkflowStepFrontmatterSchema,
} from '../../types/package-documents.js';

describe('AtomicSkillFrontmatterSchema', () => {
  it('accepts agentskills-compatible atomic frontmatter', () => {
    const parsed = AtomicSkillFrontmatterSchema.parse({
      name: 'atomic-image-review',
      description: 'Review image quality deterministically.',
      metadata: {
        nous: {
          owner: 'vision-runtime',
        },
      },
    });

    expect(parsed.name).toBe('atomic-image-review');
  });

  it('rejects legacy workflow-routing keys from canonical atomic output', () => {
    const result = AtomicSkillFrontmatterSchema.safeParse({
      name: 'legacy-hybrid',
      description: 'Old hybrid frontmatter.',
      skill_slug: 'legacy-hybrid',
    });

    expect(result.success).toBe(false);
  });
});

describe('CompositeSkillFrontmatterSchema', () => {
  it('requires dependencies.skills and metadata.nous.skill-tier', () => {
    const parsed = CompositeSkillFrontmatterSchema.parse({
      name: 'composite-research',
      description: 'Coordinate multiple constituent skills.',
      dependencies: {
        skills: [
          {
            name: 'atomic-research',
          },
        ],
      },
      metadata: {
        nous: {
          'skill-tier': 'composite',
        },
      },
    });

    expect(parsed.dependencies.skills[0]?.version).toBe('*');
  });
});

describe('WorkflowManifestFrontmatterSchema', () => {
  it('accepts canonical workflow manifest metadata', () => {
    const parsed = WorkflowManifestFrontmatterSchema.parse({
      name: 'research-workflow',
      description: 'Workflow package manifest.',
      entrypoint: 'draft',
      dependencies: {
        skills: [
          {
            name: 'atomic-research',
            version: '^1.0.0',
          },
        ],
        tools: [
          {
            name: 'web.search',
          },
        ],
      },
    });

    expect(parsed.entrypoint).toBe('draft');
    expect(parsed.dependencies?.tools[0]?.required).toBe(true);
  });
});

describe('WorkflowStepFrontmatterSchema', () => {
  it('accepts workflow_step frontmatter with runtime node metadata', () => {
    const parsed = WorkflowStepFrontmatterSchema.parse({
      nous: {
        v: 1,
        kind: 'workflow_step',
        id: 'draft',
      },
      name: 'Draft',
      type: 'model-call',
      governance: 'must',
      executionModel: 'synchronous',
      config: {
        type: 'model-call',
        modelRole: 'cortex-chat',
        promptRef: 'prompt://draft',
      },
    });

    expect(parsed.nous.kind).toBe('workflow_step');
  });
});

describe('WorkflowFlowDocumentSchema', () => {
  it('accepts workflow flow documents with explicit step refs', () => {
    const parsed = WorkflowFlowDocumentSchema.parse({
      nous: { v: 1 },
      flow: {
        id: 'research-workflow',
        mode: 'graph',
        entry_step: 'draft',
        steps: [
          {
            id: 'draft',
            file: 'steps/draft.md',
            next: ['review'],
          },
          {
            id: 'review',
            file: 'steps/review.md',
            next: [],
          },
        ],
      },
    });

    expect(parsed.flow.steps).toHaveLength(2);
  });
});

describe('ProjectWorkflowPackageBindingSchema', () => {
  it('accepts project-scoped workflow package bindings', () => {
    const parsed = ProjectWorkflowPackageBindingSchema.parse({
      workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440301',
      workflowPackageId: 'workflow.research',
      workflowPackageVersion: '1.2.3',
      entrypoint: 'draft',
      boundAt: '2026-03-16T18:00:00.000Z',
      manifestRef: '.workflows/workflow__research/WORKFLOW.md',
      flowRef: '.workflows/workflow__research/nous.flow.yaml',
    });

    expect(parsed.workflowPackageId).toBe('workflow.research');
  });
});

describe('ResolvedWorkflowDefinitionSourceSchema', () => {
  it('accepts installed-package definition sources', () => {
    const parsed = ResolvedWorkflowDefinitionSourceSchema.parse({
      workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440301',
      sourceKind: 'installed_package',
      packageId: 'workflow.research',
      packageVersion: '1.2.3',
      rootRef: '.workflows/workflow__research',
      manifestRef: '.workflows/workflow__research/WORKFLOW.md',
      bindingRef: 'project.workflow.packageBindings:550e8400-e29b-41d4-a716-446655440301',
    });

    expect(parsed.sourceKind).toBe('installed_package');
  });
});

describe('LoadedWorkflowPackageSchema', () => {
  it('accepts fully loaded workflow packages', () => {
    const parsed = LoadedWorkflowPackageSchema.parse({
      packageId: 'workflow.research',
      packageVersion: '1.2.3',
      rootRef: '.workflows/workflow__research',
      manifestRef: '.workflows/workflow__research/WORKFLOW.md',
      flowRef: '.workflows/workflow__research/nous.flow.yaml',
      manifest: {
        name: 'research-workflow',
        description: 'Workflow package manifest.',
        entrypoint: 'draft',
      },
      flow: {
        nous: { v: 1 },
        flow: {
          id: 'research-workflow',
          mode: 'graph',
          entry_step: 'draft',
          steps: [
            {
              id: 'draft',
              file: 'steps/draft.md',
              next: [],
            },
          ],
        },
      },
      steps: [
        {
          stepId: 'draft',
          fileRef: 'steps/draft.md',
          frontmatter: {
            nous: {
              v: 1,
              kind: 'workflow_step',
              id: 'draft',
            },
            name: 'Draft',
            type: 'model-call',
            governance: 'must',
            executionModel: 'synchronous',
            config: {
              type: 'model-call',
              modelRole: 'cortex-chat',
              promptRef: 'prompt://draft',
            },
          },
          body: '# Draft',
        },
      ],
      references: [],
      scripts: [],
      assets: [],
    });

    expect(parsed.format).toBe('legacy');
    expect(parsed.steps?.[0]?.stepId).toBe('draft');
  });

  it('accepts composite workflow packages without legacy flow fields', () => {
    const parsed = LoadedWorkflowPackageSchema.parse({
      packageId: 'workflow.research',
      packageVersion: '2.0.0',
      rootRef: '.workflows/workflow__research',
      manifestRef: '.workflows/workflow__research/workflow.md',
      format: 'composite',
      manifest: {
        name: 'research-workflow',
        description: 'Workflow package manifest.',
        entrypoint: 'draft-node',
      },
      topology: {
        name: 'Research Workflow',
        version: 1,
        nodes: [
          {
            id: 'draft-node',
            name: 'Draft Node',
            type: 'nous.agent.claude',
            position: [0, 0],
            parameters: {},
          },
        ],
        connections: [],
      },
      nodeContent: {
        'draft-node': {
          frontmatter: {
            nous: {
              v: 2,
              kind: 'workflow_node',
              id: 'draft-node',
              skill: 'atomic-research',
              contracts: ['quality-gate'],
              templates: ['goals-template'],
            },
          },
          body: '# Draft Node',
        },
      },
      contracts: {
        'quality-gate': {
          frontmatter: {
            contract: 'quality-gate',
            scope: 'per-node',
            description: 'Quality gate for draft output.',
          },
          body: '# Contract',
        },
      },
      templates: {
        'goals-template': {
          frontmatter: {
            template: 'goals-template',
            description: 'Goals artifact structure.',
          },
          body: '# Template',
        },
      },
      references: [],
      scripts: [],
      assets: [],
    });

    expect(parsed.format).toBe('composite');
    expect(parsed.flowRef).toBeUndefined();
    expect(parsed.nodeContent?.['draft-node']?.frontmatter.nous.skill).toBe(
      'atomic-research',
    );
  });
});

describe('LoadedAppPackageSchema', () => {
  it('accepts fully loaded app packages', () => {
    const parsed = LoadedAppPackageSchema.parse({
      packageId: 'app.weather',
      packageVersion: '1.2.3',
      rootRef: '.apps/app__weather',
      manifestRef: '.apps/app__weather/manifest.json',
      entrypointRef: '.apps/app__weather/main.ts',
      lockfileRef: '.apps/app__weather/deno.lock',
      manifest: {
        id: 'app.weather',
        name: 'weather',
        version: '1.2.3',
        package_type: 'app',
        origin_class: 'nous_first_party',
        api_contract_range: '^1.0.0',
        capabilities: ['tool.execute'],
        permissions: {
          network: ['api.example.com'],
          credentials: false,
          witnessLevel: 'session',
          systemNotify: true,
          memoryContribute: false,
        },
        tools: [
          {
            name: 'get_forecast',
            description: 'Fetch weather',
            inputSchema: {},
            outputSchema: {},
            riskLevel: 'low',
            idempotent: true,
            sideEffects: [],
            memoryRelevance: 'low',
          },
        ],
      },
      references: [],
      scripts: [],
      assets: [],
    });

    expect(parsed.entrypointRef).toContain('main.ts');
  });
});
