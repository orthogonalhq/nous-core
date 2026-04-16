/**
 * Catalog schema validity — WR-148 phase 1.1 / T5a
 *
 * Tier 1 contract test: validates that every tool definition in the
 * internal MCP catalog uses a valid JSON Schema `inputSchema` object.
 * Prevents regression if a new tool is added with informal schemas.
 */
import { describe, expect, it } from 'vitest';
import { INTERNAL_MCP_CATALOG } from '../../internal-mcp/catalog.js';

describe('INTERNAL_MCP_CATALOG inputSchema validity', () => {
  for (const entry of INTERNAL_MCP_CATALOG) {
    describe(`${entry.name}`, () => {
      const schema = entry.definition.inputSchema as Record<string, unknown>;

      it('has type: "object"', () => {
        expect(schema.type).toBe('object');
      });

      it('has properties that is an object', () => {
        expect(schema.properties).toBeDefined();
        expect(typeof schema.properties).toBe('object');
        expect(schema.properties).not.toBeNull();
      });

      it('required entries (if present) exist in properties', () => {
        if (!schema.required) return; // optional — no required array is valid
        const required = schema.required as string[];
        const properties = schema.properties as Record<string, unknown>;
        for (const key of required) {
          expect(properties).toHaveProperty(
            key,
            expect.anything(),
          );
        }
      });
    });
  }
});
