/**
 * MAO projection schema tests.
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 */
import { describe, it, expect } from 'vitest';
import {
  MaoDensityModeSchema,
  ProjectControlStateSchema,
  MaoAgentProjectionSchema,
  MaoProjectControlProjectionSchema,
  MaoProjectControlActionSchema,
  MaoEventTypeSchema,
} from '../../types/mao.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as const;
const AGENT_ID = '22222222-2222-2222-2222-222222222222' as const;

describe('MaoDensityModeSchema', () => {
  it('accepts valid density modes', () => {
    expect(MaoDensityModeSchema.parse('D0')).toBe('D0');
    expect(MaoDensityModeSchema.parse('D4')).toBe('D4');
  });

  it('rejects invalid density mode', () => {
    expect(() => MaoDensityModeSchema.parse('D5')).toThrow();
  });
});

describe('ProjectControlStateSchema', () => {
  it('accepts valid states', () => {
    expect(ProjectControlStateSchema.parse('running')).toBe('running');
    expect(ProjectControlStateSchema.parse('paused_review')).toBe('paused_review');
    expect(ProjectControlStateSchema.parse('hard_stopped')).toBe('hard_stopped');
    expect(ProjectControlStateSchema.parse('resuming')).toBe('resuming');
  });

  it('rejects invalid state', () => {
    expect(() => ProjectControlStateSchema.parse('invalid')).toThrow();
  });
});

describe('MaoAgentProjectionSchema', () => {
  const valid = {
    agent_id: AGENT_ID,
    project_id: PROJECT_ID,
    dispatching_task_agent_id: null,
    dispatch_origin_ref: 'ref-1',
    state: 'running',
    current_step: 'step-1',
    progress_percent: 50,
    risk_level: 'low' as const,
    attention_level: 'none' as const,
    pfc_alert_status: 'none',
    pfc_mitigation_status: 'none',
    dispatch_state: 'dispatched',
    reflection_cycle_count: 0,
    last_update_at: '2026-02-24T22:00:00.000Z',
    reasoning_log_preview: null,
    reasoning_log_last_entry_class: null,
    reasoning_log_last_entry_at: null,
    reasoning_log_redaction_state: 'none' as const,
  };

  it('parses valid agent projection', () => {
    const result = MaoAgentProjectionSchema.parse(valid);
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.project_id).toBe(PROJECT_ID);
    expect(result.progress_percent).toBe(50);
  });

  it('rejects invalid agent_id', () => {
    expect(() =>
      MaoAgentProjectionSchema.parse({ ...valid, agent_id: 'not-uuid' }),
    ).toThrow();
  });

  it('rejects progress_percent out of range', () => {
    expect(() =>
      MaoAgentProjectionSchema.parse({ ...valid, progress_percent: 101 }),
    ).toThrow();
  });
});

describe('MaoProjectControlProjectionSchema', () => {
  const valid = {
    project_id: PROJECT_ID,
    project_control_state: 'running' as const,
    active_agent_count: 2,
    blocked_agent_count: 0,
    urgent_agent_count: 0,
    pfc_project_review_status: 'none' as const,
    pfc_project_recommendation: 'continue' as const,
  };

  it('parses valid project control projection', () => {
    const result = MaoProjectControlProjectionSchema.parse(valid);
    expect(result.project_control_state).toBe('running');
    expect(result.active_agent_count).toBe(2);
  });

  it('rejects invalid project_control_state', () => {
    expect(() =>
      MaoProjectControlProjectionSchema.parse({
        ...valid,
        project_control_state: 'invalid',
      }),
    ).toThrow();
  });
});

describe('MaoProjectControlActionSchema', () => {
  it('accepts valid actions', () => {
    expect(MaoProjectControlActionSchema.parse('pause_project')).toBe(
      'pause_project',
    );
    expect(MaoProjectControlActionSchema.parse('hard_stop_project')).toBe(
      'hard_stop_project',
    );
  });
});

describe('MaoEventTypeSchema', () => {
  it('accepts valid event types', () => {
    expect(MaoEventTypeSchema.parse('mao_agent_state_projected')).toBe(
      'mao_agent_state_projected',
    );
    expect(MaoEventTypeSchema.parse('mao_project_control_applied')).toBe(
      'mao_project_control_applied',
    );
  });
});
