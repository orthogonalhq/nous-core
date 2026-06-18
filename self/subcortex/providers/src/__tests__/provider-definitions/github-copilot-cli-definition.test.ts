import { describe, it, expect } from 'vitest';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import {
  GITHUB_COPILOT_CLI_PROVIDER_DEFINITION,
  providerDefinition,
} from '../../providers/github-copilot-cli/definition.js';

describe('github-copilot-cli definition', () => {
  it('passes ProviderDefinitionSchema validation', () => {
    expect(() =>
      ProviderDefinitionSchema.parse(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION),
    ).not.toThrow();
  });

  it('has vendorKey github-copilot-cli', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.vendorKey).toBe('github-copilot-cli');
  });

  it('has adapterKey github-copilot-cli', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.adapterKey).toBe('github-copilot-cli');
  });

  it('uses agent-cli protocol', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.protocol).toBe(AGENT_CLI_PROTOCOL_ID);
  });

  it('declares session_bound_command execution profile', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.executionCapabilityProfile).toBe(
      'session_bound_command',
    );
  });

  it('does not hand-author wellKnownProviderId', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        GITHUB_COPILOT_CLI_PROVIDER_DEFINITION,
        'wellKnownProviderId',
      ),
    ).toBe(false);
  });

  it('marks auth as not required', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.auth.required).toBe(false);
  });

  it('is local', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.isLocal).toBe(true);
  });

  it('has headless supported with --target shell required arg', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.agentCli?.headless.supported).toBe(true);
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.agentCli?.headless.requiredArgs).toContain(
      '--target',
    );
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.agentCli?.headless.requiredArgs).toContain(
      'shell',
    );
  });

  it('exports providerDefinition alias pointing to the same object', () => {
    expect(providerDefinition).toBe(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION);
  });
});
