import type { AgentClass } from '@nous/shared';
import type { ContextBudgetDefaults } from './prompt-strategy.js';

export interface ContextBudgetResolutionContext {
  agentClass: AgentClass;
  projectId?: string;
  workflowId?: string;
  nodeId?: string;
}

export interface ContextBudgetSettings {
  maxContextTokens?: number;
  compactionThreshold?: number;
  maxTurns?: number;
  compactionStrategy?: string;
}

export interface ContextBudgetSettingsSource {
  getSettings(ctx: ContextBudgetResolutionContext): ContextBudgetSettings | undefined;
}

/**
 * Resolves context budget by walking a cascade of settings sources.
 * Resolution order: sources[0] (most specific) > ... > sources[N] (least specific) > profileDefault.
 * Each source can override individual fields; unset fields fall through.
 */
export function resolveContextBudget(
  ctx: ContextBudgetResolutionContext,
  profileDefault: ContextBudgetDefaults,
  sources?: ContextBudgetSettingsSource[],
): ContextBudgetDefaults {
  if (!sources || sources.length === 0) {
    return profileDefault;
  }

  let resolved = { ...profileDefault };
  const overridden = { maxContextTokens: false, compactionThreshold: false, maxTurns: false };

  for (const source of sources) {
    const settings = source.getSettings(ctx);
    if (!settings) continue;

    if (!overridden.maxContextTokens && settings.maxContextTokens != null) {
      resolved = { ...resolved, maxContextTokens: settings.maxContextTokens };
      overridden.maxContextTokens = true;
    }
    if (!overridden.compactionThreshold && settings.compactionThreshold != null) {
      resolved = { ...resolved, compactionThreshold: settings.compactionThreshold };
      overridden.compactionThreshold = true;
    }
    if (!overridden.maxTurns && settings.maxTurns != null) {
      resolved = { ...resolved, maxTurns: settings.maxTurns };
      overridden.maxTurns = true;
    }
  }

  return resolved;
}
