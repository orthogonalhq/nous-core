/**
 * MAO (Multi-Agent Observability) projection types for Nous-OSS.
 *
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 * Canonical source: mao-ux-architecture-v1.md
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

export const MaoDensityModeSchema = z.enum(['D0', 'D1', 'D2', 'D3', 'D4']);
export type MaoDensityMode = z.infer<typeof MaoDensityModeSchema>;

export const ProjectControlStateSchema = z.enum([
  'running',
  'paused_review',
  'hard_stopped',
  'resuming',
]);
export type ProjectControlState = z.infer<typeof ProjectControlStateSchema>;

export const MaoProjectControlActionSchema = z.enum([
  'pause_project',
  'resume_project',
  'hard_stop_project',
]);
export type MaoProjectControlAction = z.infer<
  typeof MaoProjectControlActionSchema
>;

export const MaoAgentProjectionSchema = z.object({
  agent_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  dispatching_task_agent_id: z.string().uuid().nullable(),
  dispatch_origin_ref: z.string().min(1),
  state: z.string(),
  state_reason: z.string().optional(),
  current_step: z.string(),
  progress_percent: z.number().min(0).max(100),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  attention_level: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
  pfc_alert_status: z.string(),
  pfc_mitigation_status: z.string(),
  dispatch_state: z.string(),
  reflection_cycle_count: z.number().int().nonnegative(),
  last_correction_action: z.string().optional(),
  last_correction_reason: z.string().optional(),
  last_update_at: z.string().datetime(),
  reasoning_log_preview: z.string().nullable(),
  reasoning_log_last_entry_class: z.string().nullable(),
  reasoning_log_last_entry_at: z.string().datetime().nullable(),
  reasoning_log_redaction_state: z.enum(['none', 'partial', 'restricted']),
});
export type MaoAgentProjection = z.infer<typeof MaoAgentProjectionSchema>;

export const MaoProjectControlProjectionSchema = z.object({
  project_id: ProjectIdSchema,
  project_control_state: ProjectControlStateSchema,
  active_agent_count: z.number().int().nonnegative(),
  blocked_agent_count: z.number().int().nonnegative(),
  urgent_agent_count: z.number().int().nonnegative(),
  project_last_control_action: z.string().optional(),
  project_last_control_actor: z.string().optional(),
  project_last_control_reason: z.string().optional(),
  project_last_control_at: z.string().datetime().optional(),
  pfc_project_review_status: z.enum(['none', 'pending', 'active', 'resolved']),
  pfc_project_recommendation: z.enum([
    'continue',
    'pause',
    'hard_stop',
    'resume_with_constraints',
  ]),
});
export type MaoProjectControlProjection = z.infer<
  typeof MaoProjectControlProjectionSchema
>;

export const MaoEventTypeSchema = z.enum([
  'mao_agent_state_projected',
  'mao_density_mode_changed',
  'mao_urgent_overlay_applied',
  'mao_urgent_overlay_cleared',
  'mao_project_control_requested',
  'mao_project_control_applied',
  'mao_project_control_blocked',
  'mao_pfc_project_recommendation_updated',
  'mao_project_resume_readiness_passed',
  'mao_project_resume_readiness_blocked',
  'mao_graph_lineage_rendered',
]);
export type MaoEventType = z.infer<typeof MaoEventTypeSchema>;
