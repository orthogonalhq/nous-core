import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import {
  createTextAdapter,
  defineProviderAdapter,
  parseModelOutput,
  textAdapter,
  type ProviderAdapter,
} from '../index.js';
import type { TraceId } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440177' as TraceId;

describe('provider package public exports', () => {
  it('does not publish the shared barrel subpath', () => {
    expect(packageJson.exports).not.toHaveProperty('./shared');
  });

  it('keeps canonical shared utilities available from the package root', () => {
    const adapter: ProviderAdapter = createTextAdapter();
    const output = parseModelOutput('hello', TRACE_ID);

    expect(typeof defineProviderAdapter).toBe('function');
    expect(adapter.capabilities).toEqual(textAdapter.capabilities);
    expect(output.response).toBe('hello');
  });
});
