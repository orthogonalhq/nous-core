import { describe, it, expect } from 'vitest';
import {
  NousError,
  PfcDeniedError,
  MemoryAccessDeniedError,
  ProviderError,
  ToolExecutionError,
  ConfigError,
  ValidationError,
} from '../../errors/index.js';

describe('NousError', () => {
  it('sets name, code, and message', () => {
    const err = new NousError('test error', 'TEST_CODE');
    expect(err.name).toBe('NousError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test error');
  });

  it('is an instance of Error', () => {
    const err = new NousError('test', 'CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves context', () => {
    const err = new NousError('test', 'CODE', { key: 'value' });
    expect(err.context).toEqual({ key: 'value' });
  });
});

describe('PfcDeniedError', () => {
  it('has correct name and code', () => {
    const err = new PfcDeniedError('tool-use', 'not authorized');
    expect(err.name).toBe('PfcDeniedError');
    expect(err.code).toBe('PFC_DENIED');
  });

  it('inherits from NousError', () => {
    const err = new PfcDeniedError('tool-use', 'not authorized');
    expect(err).toBeInstanceOf(NousError);
    expect(err).toBeInstanceOf(Error);
  });

  it('includes action and reason in message', () => {
    const err = new PfcDeniedError('memory-write', 'low confidence');
    expect(err.message).toContain('memory-write');
    expect(err.message).toContain('low confidence');
  });
});

describe('MemoryAccessDeniedError', () => {
  it('has correct name and code', () => {
    const err = new MemoryAccessDeniedError('project-a', 'project-b');
    expect(err.name).toBe('MemoryAccessDeniedError');
    expect(err.code).toBe('MEMORY_ACCESS_DENIED');
  });

  it('includes project IDs in message', () => {
    const err = new MemoryAccessDeniedError('project-a', 'project-b');
    expect(err.message).toContain('project-a');
    expect(err.message).toContain('project-b');
  });
});

describe('ProviderError', () => {
  it('has correct name and code', () => {
    const err = new ProviderError('ollama-local', 'connection refused');
    expect(err.name).toBe('ProviderError');
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('includes provider ID in message', () => {
    const err = new ProviderError('ollama-local', 'timeout');
    expect(err.message).toContain('ollama-local');
  });
});

describe('ToolExecutionError', () => {
  it('has correct name and code', () => {
    const err = new ToolExecutionError('web-search', 'rate limited');
    expect(err.name).toBe('ToolExecutionError');
    expect(err.code).toBe('TOOL_EXECUTION_ERROR');
  });
});

describe('ConfigError', () => {
  it('has correct name and code', () => {
    const err = new ConfigError('invalid config');
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
  });
});

describe('ValidationError', () => {
  it('has correct name and code', () => {
    const err = new ValidationError('validation failed', [
      { path: 'name', message: 'required' },
    ]);
    expect(err.name).toBe('ValidationError');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('preserves structured error details', () => {
    const errors = [
      { path: 'pfcTier', message: 'must be 0–5' },
      { path: 'name', message: 'required' },
    ];
    const err = new ValidationError('validation failed', errors);
    expect(err.context).toEqual({ errors });
  });
});
