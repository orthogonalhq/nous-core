import { describe, expect, it } from 'vitest';
import { INTERNAL_MCP_CATALOG } from '../catalog.js';
import { INTERNAL_MCP_TOOL_NAMES } from '../types.js';
import { isInternalMcpToolAuthorized } from '../authorization-matrix.js';

describe('workflow CRUD MCP tools', () => {
  describe('tool name registration', () => {
    it('workflow_create is in INTERNAL_MCP_TOOL_NAMES', () => {
      expect(INTERNAL_MCP_TOOL_NAMES).toContain('workflow_create');
    });

    it('workflow_update is in INTERNAL_MCP_TOOL_NAMES', () => {
      expect(INTERNAL_MCP_TOOL_NAMES).toContain('workflow_update');
    });

    it('workflow_delete is in INTERNAL_MCP_TOOL_NAMES', () => {
      expect(INTERNAL_MCP_TOOL_NAMES).toContain('workflow_delete');
    });
  });

  describe('catalog entries', () => {
    it('workflow_create is in the catalog with correct shape', () => {
      const entry = INTERNAL_MCP_CATALOG.find((e) => e.name === 'workflow_create');
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('capability');
      expect(entry?.definition.name).toBe('workflow_create');
    });

    it('workflow_update is in the catalog with correct shape', () => {
      const entry = INTERNAL_MCP_CATALOG.find((e) => e.name === 'workflow_update');
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('capability');
      expect(entry?.definition.name).toBe('workflow_update');
    });

    it('workflow_delete is in the catalog with correct shape', () => {
      const entry = INTERNAL_MCP_CATALOG.find((e) => e.name === 'workflow_delete');
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('capability');
      expect(entry?.definition.name).toBe('workflow_delete');
    });
  });

  describe('authorization matrix', () => {
    it('all 3 tools are authorized for Cortex::System', () => {
      expect(isInternalMcpToolAuthorized('Cortex::System', 'workflow_create')).toBe(true);
      expect(isInternalMcpToolAuthorized('Cortex::System', 'workflow_update')).toBe(true);
      expect(isInternalMcpToolAuthorized('Cortex::System', 'workflow_delete')).toBe(true);
    });

    it('all 3 tools are denied for Worker agent class', () => {
      expect(isInternalMcpToolAuthorized('Worker', 'workflow_create')).toBe(false);
      expect(isInternalMcpToolAuthorized('Worker', 'workflow_update')).toBe(false);
      expect(isInternalMcpToolAuthorized('Worker', 'workflow_delete')).toBe(false);
    });

    it('all 3 tools are denied for Cortex::Principal', () => {
      expect(isInternalMcpToolAuthorized('Cortex::Principal', 'workflow_create')).toBe(false);
      expect(isInternalMcpToolAuthorized('Cortex::Principal', 'workflow_update')).toBe(false);
      expect(isInternalMcpToolAuthorized('Cortex::Principal', 'workflow_delete')).toBe(false);
    });
  });
});
