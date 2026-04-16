import { describe, expect, it } from 'vitest';
import { INTERNAL_MCP_CATALOG } from '../catalog.js';
import { INTERNAL_MCP_TOOL_NAMES } from '../types.js';
import { isInternalMcpToolAuthorized } from '../authorization-matrix.js';
import { NODE_TYPE_PARAMETER_SCHEMAS } from '@nous/shared';

describe('workflow_authoring_reference MCP tool', () => {
  // ── Tier 1: Contract Tests ──────────────────────────────────────────────

  describe('tool name registration', () => {
    it('workflow_authoring_reference is in INTERNAL_MCP_TOOL_NAMES', () => {
      expect(INTERNAL_MCP_TOOL_NAMES).toContain('workflow_authoring_reference');
    });
  });

  describe('catalog entry', () => {
    it('workflow_authoring_reference is in the catalog with correct shape', () => {
      const entry = INTERNAL_MCP_CATALOG.find((e) => e.name === 'workflow_authoring_reference');
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('capability');
      expect(entry?.definition.name).toBe('workflow_authoring_reference');
      expect(entry?.definition.capabilities).toEqual(['read']);
      expect(entry?.definition.permissionScope).toBe('runtime');
    });

    it('catalog entry has no input parameters', () => {
      const entry = INTERNAL_MCP_CATALOG.find((e) => e.name === 'workflow_authoring_reference');
      expect(entry?.definition.inputSchema).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('authorization matrix', () => {
    it('is authorized for Cortex::System', () => {
      expect(isInternalMcpToolAuthorized('Cortex::System', 'workflow_authoring_reference')).toBe(true);
    });

    it('is authorized for Orchestrator', () => {
      expect(isInternalMcpToolAuthorized('Orchestrator', 'workflow_authoring_reference')).toBe(true);
    });

    it('is denied for Cortex::Principal', () => {
      expect(isInternalMcpToolAuthorized('Cortex::Principal', 'workflow_authoring_reference')).toBe(false);
    });

    it('is denied for Worker', () => {
      expect(isInternalMcpToolAuthorized('Worker', 'workflow_authoring_reference')).toBe(false);
    });
  });

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  describe('NODE_TYPE_PARAMETER_SCHEMAS coverage', () => {
    it('registry contains entries for all expected node types', () => {
      const nodeTypes = Object.keys(NODE_TYPE_PARAMETER_SCHEMAS);
      // Should have at least the 21 well-known types
      expect(nodeTypes.length).toBeGreaterThanOrEqual(21);
    });

    it('every node type follows nous.<category>.<action> format', () => {
      for (const nodeType of Object.keys(NODE_TYPE_PARAMETER_SCHEMAS)) {
        expect(nodeType).toMatch(/^nous\.(trigger|agent|condition|app|tool|memory|governance)\.\S+$/);
      }
    });
  });
});
