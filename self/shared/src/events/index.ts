/**
 * Domain event schemas for Nous-OSS.
 *
 * Events use a discriminated union pattern on the 'domain' field.
 */
import { z } from 'zod';
import { BaseEventSchema } from './base.js';

export { BaseEventSchema } from './base.js';
export type { BaseEvent } from './base.js';

// --- PFC Events ---
export const PfcEventSchema = BaseEventSchema.extend({
  domain: z.literal('pfc'),
  action: z.enum([
    'authorize-tool',
    'deny-tool',
    'authorize-memory-write',
    'deny-memory-write',
    'escalate',
    'reflect',
  ]),
  detail: z.record(z.unknown()),
});
export type PfcEvent = z.infer<typeof PfcEventSchema>;

// --- Memory Events ---
export const MemoryEventSchema = BaseEventSchema.extend({
  domain: z.literal('memory'),
  action: z.enum([
    'write',
    'read',
    'delete',
    'distill',
    'retrieve',
    'access-denied',
  ]),
  detail: z.record(z.unknown()),
});
export type MemoryEvent = z.infer<typeof MemoryEventSchema>;

// --- Model Events ---
export const ModelEventSchema = BaseEventSchema.extend({
  domain: z.literal('model'),
  action: z.enum([
    'invoke',
    'stream-start',
    'stream-end',
    'error',
    'fallback',
  ]),
  detail: z.record(z.unknown()),
});
export type ModelEvent = z.infer<typeof ModelEventSchema>;

// --- Tool Events ---
export const ToolEventSchema = BaseEventSchema.extend({
  domain: z.literal('tool'),
  action: z.enum(['execute', 'complete', 'error', 'denied']),
  detail: z.record(z.unknown()),
});
export type ToolEvent = z.infer<typeof ToolEventSchema>;

// --- Project Events ---
export const ProjectEventSchema = BaseEventSchema.extend({
  domain: z.literal('project'),
  action: z.enum([
    'create',
    'configure',
    'start',
    'pause',
    'resume',
    'complete',
    'archive',
  ]),
  detail: z.record(z.unknown()),
});
export type ProjectEvent = z.infer<typeof ProjectEventSchema>;

// --- System Events ---
export const SystemEventSchema = BaseEventSchema.extend({
  domain: z.literal('system'),
  action: z.enum([
    'startup',
    'shutdown',
    'health-check',
    'config-change',
    'error',
  ]),
  detail: z.record(z.unknown()),
});
export type SystemEvent = z.infer<typeof SystemEventSchema>;

// --- Discriminated Union ---
export const NousEventSchema = z.discriminatedUnion('domain', [
  PfcEventSchema,
  MemoryEventSchema,
  ModelEventSchema,
  ToolEventSchema,
  ProjectEventSchema,
  SystemEventSchema,
]);
export type NousEvent = z.infer<typeof NousEventSchema>;
