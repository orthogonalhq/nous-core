import { z } from 'zod';
import { WorkflowNodeIdSchema } from './workflow-spec.js';

const WorkflowPackageBindingNameSchema = z.string().min(1);

export const WorkflowContractFrontmatterSchema = z.object({
  contract: WorkflowPackageBindingNameSchema,
  scope: z.enum(['per-node', 'workflow-wide']),
  description: z.string().min(1),
});
export type WorkflowContractFrontmatter = z.infer<
  typeof WorkflowContractFrontmatterSchema
>;

export const WorkflowTemplateFrontmatterSchema = z.object({
  template: WorkflowPackageBindingNameSchema,
  description: z.string().min(1),
});
export type WorkflowTemplateFrontmatter = z.infer<
  typeof WorkflowTemplateFrontmatterSchema
>;

export const WorkflowNodeFrontmatterSchema = z.object({
  nous: z.object({
    v: z.literal(2),
    kind: z.literal('workflow_node'),
    id: WorkflowNodeIdSchema,
    skill: z.string().min(1).optional(),
    contracts: z.array(WorkflowPackageBindingNameSchema).optional(),
    templates: z.array(WorkflowPackageBindingNameSchema).optional(),
  }),
});
export type WorkflowNodeFrontmatter = z.infer<
  typeof WorkflowNodeFrontmatterSchema
>;

export const WorkflowPackageManifestExtensionSchema = z.object({
  contracts: z.array(WorkflowPackageBindingNameSchema).optional(),
  templates: z.array(WorkflowPackageBindingNameSchema).optional(),
});
export type WorkflowPackageManifestExtension = z.infer<
  typeof WorkflowPackageManifestExtensionSchema
>;
