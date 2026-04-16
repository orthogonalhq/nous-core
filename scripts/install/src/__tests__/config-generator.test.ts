import { describe, it, expect } from 'vitest';
import { SystemConfigSchema } from '@nous/autonomic-config';
import { generateDefaultConfig } from '../config-generator.js';

describe('generateDefaultConfig', () => {
  const expectedOllamaProviderId = '6f4b38b4-e5d0-4c91-9e4b-f7f3f7f8a5ce';

  it('returns valid config with Ollama provider', () => {
    const config = generateDefaultConfig('./data', 'llama3.2:3b');
    const parsed = SystemConfigSchema.safeParse(config);
    expect(parsed.success).toBe(true);
  });

  it('has Ollama provider and cortex-chat assignment', () => {
    const config = generateDefaultConfig('./data', 'llama3.2:3b');
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]?.name).toBe('Ollama');
    expect(config.providers[0]?.modelId).toBe('llama3.2:3b');
    expect(config.providers[0]?.id).toBe(expectedOllamaProviderId);
    expect(config.modelRoleAssignments).toHaveLength(1);
    expect(config.modelRoleAssignments[0]?.role).toBe('cortex-chat');
    expect(config.modelRoleAssignments[0]?.providerId).toBe(expectedOllamaProviderId);
  });
});
