/**
 * Integration tests for MCP workflow tool handlers with YAML spec support.
 *
 * Tests the handler logic for:
 * - workflow_start with yamlSpec parameter
 * - workflow_validate
 * - workflow_from_spec
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWorkflowSpec } from '../parser.js';
import {
  specToWorkflowDefinition,
  type SpecToDefinitionOptions,
} from '../runtime-adapter.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_YAML = `
name: Test Workflow
version: 1
nodes:
  - id: trigger
    name: Webhook Trigger
    type: nous.trigger.webhook
    position: [0, 0]
    parameters:
      path: /hook
  - id: agent
    name: Claude Agent
    type: nous.agent.claude
    position: [200, 0]
    parameters:
      model: claude-3-opus
connections:
  - from: trigger
    to: agent
`;

const INVALID_YAML_SCHEMA = `
name: Bad Workflow
version: 1
nodes: []
`;

const INVALID_YAML_SYNTAX = `
name: Broken
  version: 1
    nodes:
  - bad indentation: [
`;

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Handler simulation helpers
// ---------------------------------------------------------------------------

/**
 * Simulates the workflow_start handler's yamlSpec branch logic.
 * Extracted from capability-handlers.ts to test without full MCP wiring.
 */
function handleWorkflowStartWithYamlSpec(yamlSpec: string, projectId: string) {
  const parseResult = parseWorkflowSpec(yamlSpec);
  if (!parseResult.success) {
    return {
      success: false,
      output: { valid: false, errors: parseResult.errors },
      durationMs: 0,
    };
  }

  const specDefinition = specToWorkflowDefinition(parseResult.data, {
    projectId,
  });

  return {
    success: true,
    output: {
      workflowDefinitionId: specDefinition.id,
      definitionName: specDefinition.name,
      nodeCount: specDefinition.nodes.length,
      edgeCount: specDefinition.edges.length,
    },
    durationMs: 0,
  };
}

/**
 * Simulates the workflow_validate handler logic.
 */
function handleWorkflowValidate(yamlSpec: string) {
  const parseResult = parseWorkflowSpec(yamlSpec);
  if (parseResult.success) {
    return { valid: true };
  }
  return { valid: false, errors: parseResult.errors };
}

/**
 * Simulates the workflow_from_spec handler logic.
 */
function handleWorkflowFromSpec(yamlSpec: string, projectId: string) {
  const parseResult = parseWorkflowSpec(yamlSpec);
  if (!parseResult.success) {
    return {
      success: false,
      output: { valid: false, errors: parseResult.errors },
      durationMs: 0,
    };
  }

  const specDefinition = specToWorkflowDefinition(parseResult.data, {
    projectId,
  });

  return {
    success: true,
    output: {
      workflowDefinitionId: specDefinition.id,
      definitionName: specDefinition.name,
    },
    durationMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP workflow spec integration', () => {
  describe('workflow_start with yamlSpec', () => {
    it('parses valid YAML, converts to definition, and returns success', () => {
      const result = handleWorkflowStartWithYamlSpec(VALID_YAML, PROJECT_ID);

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        definitionName: 'Test Workflow',
        nodeCount: 2,
        edgeCount: 1,
      });
      expect(result.output.workflowDefinitionId).toBeDefined();
    });

    it('returns validation errors for invalid YAML schema', () => {
      const result = handleWorkflowStartWithYamlSpec(
        INVALID_YAML_SCHEMA,
        PROJECT_ID,
      );

      expect(result.success).toBe(false);
      expect(result.output).toHaveProperty('valid', false);
      expect(result.output).toHaveProperty('errors');
      expect((result.output as any).errors.length).toBeGreaterThan(0);
    });

    it('returns parse errors for malformed YAML', () => {
      const result = handleWorkflowStartWithYamlSpec(
        INVALID_YAML_SYNTAX,
        PROJECT_ID,
      );

      expect(result.success).toBe(false);
      expect(result.output).toHaveProperty('valid', false);
      expect((result.output as any).errors).toBeDefined();
    });
  });

  describe('workflow_validate', () => {
    it('returns valid: true for valid YAML spec', () => {
      const result = handleWorkflowValidate(VALID_YAML);

      expect(result).toEqual({ valid: true });
    });

    it('returns valid: false with errors for invalid YAML schema', () => {
      const result = handleWorkflowValidate(INVALID_YAML_SCHEMA);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('returns valid: false with errors for malformed YAML', () => {
      const result = handleWorkflowValidate(INVALID_YAML_SYNTAX);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]!.message).toMatch(/YAML parse error/);
    });
  });

  describe('workflow_from_spec', () => {
    it('creates a workflow definition from valid YAML and returns ID', () => {
      const result = handleWorkflowFromSpec(VALID_YAML, PROJECT_ID);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('workflowDefinitionId');
      expect(result.output).toHaveProperty(
        'definitionName',
        'Test Workflow',
      );
    });

    it('returns validation errors for invalid YAML', () => {
      const result = handleWorkflowFromSpec(INVALID_YAML_SCHEMA, PROJECT_ID);

      expect(result.success).toBe(false);
      expect(result.output).toHaveProperty('valid', false);
      expect((result.output as any).errors.length).toBeGreaterThan(0);
    });

    it('produces a definition with correct projectId binding', () => {
      const parseResult = parseWorkflowSpec(VALID_YAML);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      const definition = specToWorkflowDefinition(parseResult.data, {
        projectId: PROJECT_ID,
      });

      expect(definition.projectId).toBe(PROJECT_ID);
      expect(definition.name).toBe('Test Workflow');
      expect(definition.nodes).toHaveLength(2);
      expect(definition.edges).toHaveLength(1);
      expect(definition.entryNodeIds).toHaveLength(1);
    });
  });

  describe('round-trip fidelity', () => {
    it('spec definition has all expected runtime fields', () => {
      const parseResult = parseWorkflowSpec(VALID_YAML);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      const definition = specToWorkflowDefinition(parseResult.data, {
        projectId: PROJECT_ID,
      });

      // Verify runtime definition structure
      expect(definition.id).toBeDefined();
      expect(definition.mode).toBe('protocol');
      expect(definition.version).toBe('1');

      // Verify nodes have runtime config
      for (const node of definition.nodes) {
        expect(node.id).toBeDefined();
        expect(node.name).toBeDefined();
        expect(node.type).toBeDefined();
        expect(node.config).toBeDefined();
        expect(node.governance).toBe('should');
        expect(node.executionModel).toBe('synchronous');
      }

      // Verify edges reference valid node UUIDs
      const nodeIds = new Set(definition.nodes.map((n) => n.id));
      for (const edge of definition.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        expect(nodeIds.has(edge.to)).toBe(true);
      }
    });
  });
});
