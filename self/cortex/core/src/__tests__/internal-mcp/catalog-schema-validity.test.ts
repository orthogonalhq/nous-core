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

      it('has properties or oneOf that describes the shape', () => {
        // Accept either a flat schema with `properties`, or a discriminated
        // union with `oneOf` / `anyOf` (BT Round 2, RC-3 — memory_search uses
        // a discriminated union to publish its full request schema).
        const hasProperties = schema.properties !== undefined;
        const hasOneOf = Array.isArray(schema.oneOf);
        const hasAnyOf = Array.isArray(schema.anyOf);
        expect(hasProperties || hasOneOf || hasAnyOf).toBe(true);
        if (hasProperties) {
          expect(typeof schema.properties).toBe('object');
          expect(schema.properties).not.toBeNull();
        }
      });

      it('required entries (if present) exist in properties', () => {
        if (!schema.required) return; // optional — no required array is valid
        if (!schema.properties) return; // discriminated unions check requireds per-branch
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
