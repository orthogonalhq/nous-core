import { z } from 'zod';
import { AppPackageManifestSchema } from './app-manifest.js';
import {
  ExecutionModelSchema,
  GovernanceLevelSchema,
} from './enums.js';
import {
  WorkflowDefinitionIdSchema,
} from './ids.js';
import {
  WorkflowContractFrontmatterSchema,
  WorkflowNodeFrontmatterSchema,
  WorkflowTemplateFrontmatterSchema,
} from './workflow-package.js';
import {
  WorkflowSpecSchema,
} from './workflow-spec.js';
import {
  WorkflowNodeConfigSchema,
  WorkflowNodeKindSchema,
  WorkflowSchemaRefSchema,
} from './workflow.js';

export const SkillFrontmatterBaseSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  license: z.string().min(1).optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  'allowed-tools': z.string().min(1).optional(),
});
export type SkillFrontmatterBase = z.infer<typeof SkillFrontmatterBaseSchema>;

const LEGACY_ATOMIC_ONLY_KEYS = [
  'dependencies',
  'skill_slug',
  'entrypoint_mode_slug',
  'entrypoint_mode_slugs',
] as const;

export const AtomicSkillFrontmatterSchema = SkillFrontmatterBaseSchema.extend({
  dependencies: z.unknown().optional(),
  skill_slug: z.unknown().optional(),
  entrypoint_mode_slug: z.unknown().optional(),
  entrypoint_mode_slugs: z.unknown().optional(),
}).superRefine((value, ctx) => {
  for (const key of LEGACY_ATOMIC_ONLY_KEYS) {
    if (key in value && value[key] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is not part of the canonical atomic skill manifest`,
      });
    }
  }
});
export type AtomicSkillFrontmatter = z.infer<typeof AtomicSkillFrontmatterSchema>;

export const CompositeSkillDependencySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).default('*'),
});
export type CompositeSkillDependency = z.infer<typeof CompositeSkillDependencySchema>;

export const CompositeSkillFrontmatterSchema = SkillFrontmatterBaseSchema.extend({
  dependencies: z.object({
    skills: z.array(CompositeSkillDependencySchema).min(1),
  }),
}).superRefine((value, ctx) => {
  const tier = (
    value.metadata &&
    typeof value.metadata === 'object' &&
    'nous' in value.metadata &&
    typeof value.metadata.nous === 'object' &&
    value.metadata.nous != null &&
    'skill-tier' in value.metadata.nous
  )
    ? (value.metadata.nous as Record<string, unknown>)['skill-tier']
    : undefined;

  if (tier !== 'composite') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata', 'nous', 'skill-tier'],
      message: "Composite skills must set metadata.nous['skill-tier'] to 'composite'",
    });
  }
});
export type CompositeSkillFrontmatter = z.infer<typeof CompositeSkillFrontmatterSchema>;

export const SkillPackageKindSchema = z.enum([
  'atomic',
  'composite',
  'legacy_hybrid',
]);
export type SkillPackageKind = z.infer<typeof SkillPackageKindSchema>;

export const SkillResourceRefsSchema = z.object({
  references: z.array(z.string().min(1)).default([]),
  scripts: z.array(z.string().min(1)).default([]),
  assets: z.array(z.string().min(1)).default([]),
});
export type SkillResourceRefs = z.infer<typeof SkillResourceRefsSchema>;

export const LegacyWorkflowRefsSchema = z.object({
  flowRef: z.string().min(1).optional(),
  stepRefs: z.array(z.string().min(1)).default([]),
});
export type LegacyWorkflowRefs = z.infer<typeof LegacyWorkflowRefsSchema>;

export const LoadedSkillPackageSchema = z.object({
  packageId: z.string().min(1),
  packageVersion: z.string().min(1).optional(),
  rootRef: z.string().min(1),
  manifestRef: z.string().min(1),
  kind: SkillPackageKindSchema,
  frontmatter: z
    .union([AtomicSkillFrontmatterSchema, CompositeSkillFrontmatterSchema])
    .optional(),
  body: z.string(),
  resourceRefs: SkillResourceRefsSchema.default({
    references: [],
    scripts: [],
    assets: [],
  }),
  legacyWorkflowRefs: LegacyWorkflowRefsSchema.optional(),
});
export type LoadedSkillPackage = z.infer<typeof LoadedSkillPackageSchema>;

export const WorkflowPackageToolDependencySchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(true),
});
export type WorkflowPackageToolDependency = z.infer<
  typeof WorkflowPackageToolDependencySchema
>;

export const WorkflowManifestFrontmatterSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  entrypoint: z.string().min(1),
  entrypoints: z.array(z.string().min(1)).optional(),
  dependencies: z
    .object({
      skills: z.array(CompositeSkillDependencySchema).default([]),
      tools: z.array(WorkflowPackageToolDependencySchema).default([]),
    })
    .optional(),
  license: z.string().min(1).optional(),
  compatibility: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type WorkflowManifestFrontmatter = z.infer<
  typeof WorkflowManifestFrontmatterSchema
>;

export const WorkflowStepFrontmatterSchema = z
  .object({
    nous: z.object({
      v: z.literal(1),
      kind: z.literal('workflow_step'),
      id: z.string().min(1),
    }),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: WorkflowNodeKindSchema.optional(),
    governance: GovernanceLevelSchema.optional(),
    executionModel: ExecutionModelSchema.optional(),
    inputSchemaRef: WorkflowSchemaRefSchema.optional(),
    outputSchemaRef: WorkflowSchemaRefSchema.optional(),
    config: WorkflowNodeConfigSchema.optional(),
  })
  .passthrough();
export type WorkflowStepFrontmatter = z.infer<typeof WorkflowStepFrontmatterSchema>;

export const LoadedWorkflowStepSchema = z.object({
  stepId: z.string().min(1),
  fileRef: z.string().min(1),
  frontmatter: WorkflowStepFrontmatterSchema,
  body: z.string(),
});
export type LoadedWorkflowStep = z.infer<typeof LoadedWorkflowStepSchema>;

export const LoadedWorkflowNodeContentSchema = z.object({
  frontmatter: WorkflowNodeFrontmatterSchema,
  body: z.string(),
});
export type LoadedWorkflowNodeContent = z.infer<
  typeof LoadedWorkflowNodeContentSchema
>;

export const LoadedWorkflowContractContentSchema = z.object({
  frontmatter: WorkflowContractFrontmatterSchema,
  body: z.string(),
});
export type LoadedWorkflowContractContent = z.infer<
  typeof LoadedWorkflowContractContentSchema
>;

export const LoadedWorkflowTemplateContentSchema = z.object({
  frontmatter: WorkflowTemplateFrontmatterSchema,
  body: z.string(),
});
export type LoadedWorkflowTemplateContent = z.infer<
  typeof LoadedWorkflowTemplateContentSchema
>;

export const WorkflowFlowEdgeTargetSchema = z.union([
  z.string().min(1),
  z.object({
    to: z.string().min(1),
    branchKey: z.string().min(1).optional(),
    priority: z.number().int().min(0).default(0),
  }),
]);
export type WorkflowFlowEdgeTarget = z.infer<typeof WorkflowFlowEdgeTargetSchema>;

export const WorkflowFlowStepSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  next: z.array(WorkflowFlowEdgeTargetSchema).default([]),
});
export type WorkflowFlowStep = z.infer<typeof WorkflowFlowStepSchema>;

export const WorkflowFlowDocumentSchema = z.object({
  nous: z.object({
    v: z.literal(1),
  }),
  flow: z.object({
    id: z.string().min(1),
    mode: z.string().min(1),
    entry_step: z.string().min(1),
    steps: z.array(WorkflowFlowStepSchema).min(1),
  }),
});
export type WorkflowFlowDocument = z.infer<typeof WorkflowFlowDocumentSchema>;

export const LoadedWorkflowPackageSchema = z.object({
  packageId: z.string().min(1),
  packageVersion: z.string().min(1).optional(),
  rootRef: z.string().min(1),
  manifestRef: z.string().min(1),
  format: z.enum(['legacy', 'composite']).default('legacy'),
  flowRef: z.string().min(1).optional(),
  manifest: WorkflowManifestFrontmatterSchema,
  flow: z.record(z.unknown()).optional(),
  steps: z.array(LoadedWorkflowStepSchema).min(1).optional(),
  topology: WorkflowSpecSchema.optional(),
  nodeContent: z.record(z.string(), LoadedWorkflowNodeContentSchema).optional(),
  contracts: z
    .record(z.string(), LoadedWorkflowContractContentSchema)
    .optional(),
  templates: z
    .record(z.string(), LoadedWorkflowTemplateContentSchema)
    .optional(),
  references: z.array(z.string().min(1)).default([]),
  scripts: z.array(z.string().min(1)).default([]),
  assets: z.array(z.string().min(1)).default([]),
});
export type LoadedWorkflowPackage = z.infer<typeof LoadedWorkflowPackageSchema>;

export const LoadedAppPackageSchema = z.object({
  packageId: z.string().min(1),
  packageVersion: z.string().min(1).optional(),
  rootRef: z.string().min(1),
  manifestRef: z.string().min(1),
  manifest: AppPackageManifestSchema,
  entrypointRef: z.string().min(1),
  lockfileRef: z.string().min(1).optional(),
  references: z.array(z.string().min(1)).default([]),
  scripts: z.array(z.string().min(1)).default([]),
  assets: z.array(z.string().min(1)).default([]),
});
export type LoadedAppPackage = z.infer<typeof LoadedAppPackageSchema>;

export const ProjectWorkflowPackageBindingSchema = z.object({
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  workflowPackageId: z.string().min(1),
  workflowPackageVersion: z.string().min(1).optional(),
  entrypoint: z.string().min(1),
  boundAt: z.string().datetime(),
  manifestRef: z.string().min(1),
  flowRef: z.string().min(1).optional(),
});
export type ProjectWorkflowPackageBinding = z.infer<
  typeof ProjectWorkflowPackageBindingSchema
>;

export const WorkflowDefinitionSourceKindSchema = z.enum([
  'project_inline',
  'installed_package',
  'legacy_hybrid_bridge',
]);
export type WorkflowDefinitionSourceKind = z.infer<
  typeof WorkflowDefinitionSourceKindSchema
>;

export const ResolvedWorkflowDefinitionSourceSchema = z.object({
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  sourceKind: WorkflowDefinitionSourceKindSchema,
  packageId: z.string().min(1).optional(),
  packageVersion: z.string().min(1).optional(),
  rootRef: z.string().min(1).optional(),
  manifestRef: z.string().min(1).optional(),
  bindingRef: z.string().min(1).optional(),
});
export type ResolvedWorkflowDefinitionSource = z.infer<
  typeof ResolvedWorkflowDefinitionSourceSchema
>;
