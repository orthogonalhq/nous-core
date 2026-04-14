import { describe, expect, it } from 'vitest';
import {
  WorkflowContractFrontmatterSchema,
  WorkflowNodeFrontmatterSchema,
  WorkflowPackageManifestExtensionSchema,
  WorkflowTemplateFrontmatterSchema,
} from '@nous/shared';

describe('WorkflowContractFrontmatterSchema', () => {
  it('accepts valid contract frontmatter', () => {
    const result = WorkflowContractFrontmatterSchema.safeParse({
      contract: 'gate-exit',
      scope: 'per-node',
      description: 'Ensures packeted gate exits.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid contract frontmatter', () => {
    expect(
      WorkflowContractFrontmatterSchema.safeParse({
        contract: 'gate-exit',
        description: 'Missing scope',
      }).success,
    ).toBe(false);
    expect(
      WorkflowContractFrontmatterSchema.safeParse({
        contract: 'gate-exit',
        scope: 'node-only',
        description: 'Bad scope',
      }).success,
    ).toBe(false);
  });
});

describe('WorkflowTemplateFrontmatterSchema', () => {
  it('accepts valid template frontmatter', () => {
    const result = WorkflowTemplateFrontmatterSchema.safeParse({
      template: 'goals',
      description: 'Goals artifact template.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required template fields', () => {
    expect(
      WorkflowTemplateFrontmatterSchema.safeParse({
        template: 'goals',
      }).success,
    ).toBe(false);
  });
});

describe('WorkflowNodeFrontmatterSchema', () => {
  it('accepts valid v2 workflow node frontmatter', () => {
    const result = WorkflowNodeFrontmatterSchema.safeParse({
      nous: {
        v: 2,
        kind: 'workflow_node',
        id: 'compile-fail-context',
        skill: 'engineer-workflow-sop',
        contracts: ['gate-exit'],
        templates: ['goals'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects wrong version and invalid node ids', () => {
    expect(
      WorkflowNodeFrontmatterSchema.safeParse({
        nous: {
          v: 1,
          kind: 'workflow_node',
          id: 'compile-fail-context',
        },
      }).success,
    ).toBe(false);
    expect(
      WorkflowNodeFrontmatterSchema.safeParse({
        nous: {
          v: 2,
          kind: 'workflow_node',
          id: 'Bad ID',
        },
      }).success,
    ).toBe(false);
  });
});

describe('WorkflowPackageManifestExtensionSchema', () => {
  it('accepts empty and populated manifest extensions', () => {
    expect(
      WorkflowPackageManifestExtensionSchema.safeParse({}).success,
    ).toBe(true);
    expect(
      WorkflowPackageManifestExtensionSchema.safeParse({
        contracts: ['gate-exit'],
        templates: ['goals'],
      }).success,
    ).toBe(true);
  });

  it('rejects invalid manifest extension entries', () => {
    expect(
      WorkflowPackageManifestExtensionSchema.safeParse({
        contracts: [''],
      }).success,
    ).toBe(false);
    expect(
      WorkflowPackageManifestExtensionSchema.safeParse({
        templates: [''],
      }).success,
    ).toBe(false);
  });
});
