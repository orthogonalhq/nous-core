import { describe, it, expect } from 'vitest';
import { SystemConfigSchema } from '@nous/autonomic-config';
import { generateDefaultConfig } from '../config-generator.js';

describe('generateDefaultConfig', () => {
  it('returns valid config with Ollama provider', () => {
    const config = generateDefaultConfig('./data', 'llama3.2:3b');
    const parsed = SystemConfigSchema.safeParse(config);
    expect(parsed.success).toBe(true);
  });

  it('has Ollama provider and reasoner assignment', () => {
    const config = generateDefaultConfig('./data', 'llama3.2:3b');
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]?.name).toBe('Ollama');
    expect(config.providers[0]?.modelId).toBe('llama3.2:3b');
    expect(config.modelRoleAssignments).toHaveLength(1);
    expect(config.modelRoleAssignments[0]?.role).toBe('reasoner');
    expect(config.modelRoleAssignments[0]?.providerId).toBe('ollama-default');
  });
});
