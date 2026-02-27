/**
 * Ingress evidence chain event types for Nous-OSS.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Canonical source: automation-gateway-ingress-architecture-v1.md
 */
import { z } from 'zod';

export const IngressEvidenceEventTypeSchema = z.enum([
  'ingress_received',
  'ingress_authenticated',
  'ingress_authorized',
  'ingress_idempotency_evaluated',
  'ingress_dispatched',
  'ingress_rejected',
]);
export type IngressEvidenceEventType = z.infer<
  typeof IngressEvidenceEventTypeSchema
>;
