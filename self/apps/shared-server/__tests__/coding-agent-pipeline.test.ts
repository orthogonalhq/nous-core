/**
 * Tests for the end-to-end coding agent pipeline integration.
 *
 * Verifies:
 * - Coding agent node types are registered in bootstrap
 * - dispatchCodingTask router creates correct workflow spec
 * - Model routing configures Principal (thinking) vs System (fast) profiles
 * - Agent session entries are queryable after dispatch
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('coding agent pipeline integration', () => {
  describe('bootstrap node type registration', () => {
    it('imports registerCodingAgentNodeTypes in bootstrap', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain(
        "import { registerCodingAgentNodeTypes } from '@nous/subcortex-coding-agents'",
      );
    });

    it('calls registerCodingAgentNodeTypes with handler overrides map', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain('codingAgentNodeHandlerOverrides');
      expect(content).toContain('registerCodingAgentNodeTypes(codingAgentNodeHandlerOverrides');
    });

    it('passes nodeHandlerOverrides to DeterministicWorkflowEngine', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain('nodeHandlerOverrides: codingAgentNodeHandlerOverrides');
    });

    it('declares @nous/subcortex-coding-agents as a dependency', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      expect(pkg.dependencies['@nous/subcortex-coding-agents']).toBe('workspace:*');
    });

    it('passes pfcEngine and witnessService to registerCodingAgentNodeTypes', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      // Verify deps are passed
      expect(content).toContain('pfcEngine: Cortex');
      expect(content).toContain('witnessService');
      expect(content).toContain('onMaoEvent');
    });
  });

  describe('model routing for Principal vs System', () => {
    it('configures defaultModelRequirements with fast profile for System gateway', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain("profile: 'fast'");
      expect(content).toContain("fallbackPolicy: 'block_if_unmet'");
    });

    it('sets defaultModelRequirements on gateway runtime config', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain('defaultModelRequirements:');
    });
  });

  describe('dispatchCodingTask tRPC router', () => {
    it('exists as a router file', () => {
      const path = join(ROOT, 'src/trpc/routers/coding-agents.ts');
      const content = readFileSync(path, 'utf-8');
      expect(content).toContain('codingAgentsRouter');
    });

    it('exports dispatchCodingTask mutation', () => {
      const content = readFileSync(
        join(ROOT, 'src/trpc/routers/coding-agents.ts'),
        'utf-8',
      );
      expect(content).toContain('dispatchCodingTask');
    });

    it('creates workflow YAML with nous.agent.claude node type', () => {
      const content = readFileSync(
        join(ROOT, 'src/trpc/routers/coding-agents.ts'),
        'utf-8',
      );
      expect(content).toContain('nous.agent.claude');
      expect(content).toContain('Coding Task');
    });

    it('dispatches to System gateway via submitTaskToSystem', () => {
      const content = readFileSync(
        join(ROOT, 'src/trpc/routers/coding-agents.ts'),
        'utf-8',
      );
      expect(content).toContain('submitTaskToSystem');
    });

    it('returns sessionId and workflowRunId', () => {
      const content = readFileSync(
        join(ROOT, 'src/trpc/routers/coding-agents.ts'),
        'utf-8',
      );
      expect(content).toContain('sessionId');
      expect(content).toContain('workflowRunId');
      expect(content).toContain('dispatchRef');
    });

    it('is registered in the root router', () => {
      const content = readFileSync(join(ROOT, 'src/trpc/root.ts'), 'utf-8');
      expect(content).toContain('codingAgents: codingAgentsRouter');
    });

    it('exposes getSession and listSessions queries', () => {
      const content = readFileSync(
        join(ROOT, 'src/trpc/routers/coding-agents.ts'),
        'utf-8',
      );
      expect(content).toContain('getSession:');
      expect(content).toContain('listSessions:');
    });
  });

  describe('agent sessions in context', () => {
    it('NousContext includes agentSessions map', () => {
      const content = readFileSync(join(ROOT, 'src/context.ts'), 'utf-8');
      expect(content).toContain('agentSessions:');
      expect(content).toContain('AgentSessionEntry');
    });

    it('NousContext includes codingAgentMaoEvents', () => {
      const content = readFileSync(join(ROOT, 'src/context.ts'), 'utf-8');
      expect(content).toContain('codingAgentMaoEvents:');
    });

    it('bootstrap creates agentSessions map', () => {
      const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');
      expect(content).toContain('agentSessions');
    });
  });

  describe('desktop agent panel registration', () => {
    it('imports AgentPanel in desktop panel map', () => {
      const panelMapPath = join(
        ROOT,
        '../desktop/src/renderer/src/desktop-panel-map.ts',
      );
      const content = readFileSync(panelMapPath, 'utf-8');
      expect(content).toContain('AgentPanel');
    });

    it('registers coding-agents panel component', () => {
      const panelMapPath = join(
        ROOT,
        '../desktop/src/renderer/src/desktop-panel-map.ts',
      );
      const content = readFileSync(panelMapPath, 'utf-8');
      expect(content).toContain("'coding-agents': AgentPanel");
    });

    it('includes coding-agents in NATIVE_PANEL_DEFS', () => {
      const appPath = join(
        ROOT,
        '../desktop/src/renderer/src/App.tsx',
      );
      const content = readFileSync(appPath, 'utf-8');
      expect(content).toContain("id: 'coding-agents'");
      expect(content).toContain("component: 'coding-agents'");
    });

    it('sets default position for coding-agents panel', () => {
      const appPath = join(
        ROOT,
        '../desktop/src/renderer/src/App.tsx',
      );
      const content = readFileSync(appPath, 'utf-8');
      expect(content).toContain("'coding-agents':");
    });
  });
});
