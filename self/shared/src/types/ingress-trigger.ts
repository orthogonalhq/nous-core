/**
 * Ingress trigger envelope types for Nous-OSS.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Canonical source: automation-gateway-ingress-architecture-v1.md
 *
 * @remarks
 * **payload_ref format (V1):** `sha256:<hex>` — 64-char hex SHA-256 digest of payload body.
 * Adapters must compute the digest before constructing the envelope.
 * Schema accepts any non-empty string; runtime validation may enforce sha256:[a-f0-9]{64} for V1.
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';
import { WorkmodeIdSchema } from './workmode.js';

export const IngressTriggerTypeSchema = z.enum([
  'scheduler',
  'hook',
  'webhook',
  'system_event',
]);
export type IngressTriggerType = z.infer<typeof IngressTriggerTypeSchema>;

export const IngressDeliveryModeSchema = z.enum([
  'none',
  'announce',
  'webhook_callback',
]);
export type IngressDeliveryMode = z.infer<typeof IngressDeliveryModeSchema>;

export const IngressTriggerEnvelopeSchema = z.object({
  trigger_id: z.string().uuid(),
  trigger_type: IngressTriggerTypeSchema,
  source_id: z.string().min(1),
  project_id: ProjectIdSchema,
  workflow_ref: z.string().min(1),
  workmode_id: WorkmodeIdSchema,
  event_name: z.string().min(1),
  payload_ref: z.string().min(1),
  idempotency_key: z.string().min(1),
  nonce: z.string().min(1),
  occurred_at: z.string().datetime(),
  received_at: z.string().datetime(),
  auth_context_ref: z.string().min(1).nullable(),
  trace_parent: z.string().nullable(),
  requested_delivery_mode: IngressDeliveryModeSchema.default('none'),
});
export type IngressTriggerEnvelope = z.infer<typeof IngressTriggerEnvelopeSchema>;

/** V1 payload_ref format: sha256:<64-char-hex> */
export const PAYLOAD_REF_SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;
