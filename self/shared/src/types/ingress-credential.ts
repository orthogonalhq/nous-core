/**
 * Ingress credential scope types for Nous-OSS.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Credentials are workflow-bound per automation-gateway-ingress-architecture-v1.md
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

export const IngressCredentialScopeSchema = z.object({
  project_id: ProjectIdSchema,
  workflow_ref: z.string().min(1),
  allowed_event_names: z.array(z.string().min(1)),
  key_id: z.string().min(1),
  expiry: z.string().datetime().optional(),
});
export type IngressCredentialScope = z.infer<typeof IngressCredentialScopeSchema>;
