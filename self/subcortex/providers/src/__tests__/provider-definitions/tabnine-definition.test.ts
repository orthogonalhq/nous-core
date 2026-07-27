import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import {
  TABNINE_PROVIDER_DEFINITION,
  providerDefinition,
} from '../../providers/tabnine/definition.js';

describe('tabnine definition', () => {
  it('satisfies ProviderDefinitionSchema once hydrated with a derived id', () => {
    // Leaves omit wellKnownProviderId; hydrate the derived id before strict validation.
    const hydrated = {
      ...TABNINE_PROVIDER_DEFINITION,
      wellKnownProviderId: deriveBuiltInProviderId('tabnine') as ProviderId,
    };
    expect(() => ProviderDefinitionSchema.parse(hydrated)).not.toThrow();
  });

  it('has vendorKey tabnine', () => {
    expect(TABNINE_PROVIDER_DEFINITION.vendorKey).toBe('tabnine');
  });

  it('has adapterKey tabnine', () => {
    expect(TABNINE_PROVIDER_DEFINITION.adapterKey).toBe('tabnine');
  });

  it('uses agent-cli protocol', () => {
    expect(TABNINE_PROVIDER_DEFINITION.protocol).toBe(AGENT_CLI_PROTOCOL_ID);
  });

  it('declares one_shot_command execution profile', () => {
    expect(TABNINE_PROVIDER_DEFINITION.executionCapabilityProfile).toBe('one_shot_command');
  });

  it('does not hand-author wellKnownProviderId', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        TABNINE_PROVIDER_DEFINITION,
        'wellKnownProviderId',
      ),
    ).toBe(false);
  });

  it('marks auth as not required with the TABNINE_TOKEN headless credential', () => {
    expect(TABNINE_PROVIDER_DEFINITION.auth.required).toBe(false);
    expect(TABNINE_PROVIDER_DEFINITION.auth.purpose).toBe('api_key');
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.auth).toMatchObject({
      kind: 'api_key',
      envVar: 'TABNINE_TOKEN',
    });
  });

  it('is local', () => {
    expect(TABNINE_PROVIDER_DEFINITION.isLocal).toBe(true);
  });

  it('supports headless execution without forcing the -y auto-accept flag', () => {
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.headless.supported).toBe(true);
    // `-y` (auto-accept / YOLO) is intentionally NOT a default required arg because
    // it auto-approves Tabnine tool actions; the default headless invocation is
    // `tabnine -p "<prompt>"`. Opting into auto-accept is a separate, trusted choice.
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.headless.requiredArgs).toEqual([]);
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.headless.requiredArgs).not.toContain('-y');
  });

  it('targets the tabnine one-shot command surface', () => {
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.command.executable).toBe('tabnine');
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.command.defaultArgs).toEqual([]);
  });

  it('installs from the Tabnine host installer rather than npm', () => {
    const install = TABNINE_PROVIDER_DEFINITION.agentCli?.install;
    expect(install?.command).toContain('installer.mjs');
    expect(install?.versionCommand).toBe('tabnine --version');
    // Tabnine is not an npm package, so no packageName is declared.
    expect(install && 'packageName' in install).toBe(false);
    // The install command targets the Tabnine cloud host by default; the notes must
    // tell self-hosted users to substitute their own TABNINE_HOST.
    expect(install?.notes).toContain('TABNINE_HOST');
  });

  it('uses a local placeholder endpoint and catalog default model id', () => {
    expect(TABNINE_PROVIDER_DEFINITION.defaultEndpoint).toBe('http://localhost');
    expect(TABNINE_PROVIDER_DEFINITION.defaultModelId).toBe('tabnine/default');
  });

  it('references issue #300', () => {
    expect(TABNINE_PROVIDER_DEFINITION.agentCli?.targetIssueRefs).toContain('#300');
  });

  it('exports providerDefinition alias pointing to the same object', () => {
    expect(providerDefinition).toBe(TABNINE_PROVIDER_DEFINITION);
  });
});
