import { describe, it, expect } from 'vitest';
import {
  PfcEventSchema,
  MemoryEventSchema,
  ModelEventSchema,
  ToolEventSchema,
  ProjectEventSchema,
  SystemEventSchema,
  NousEventSchema,
  BaseEventSchema,
} from '../../events/index.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

const baseEvent = {
  id: VALID_UUID,
  timestamp: NOW,
};

describe('BaseEventSchema', () => {
  it('accepts minimal base event', () => {
    expect(BaseEventSchema.safeParse(baseEvent).success).toBe(true);
  });

  it('accepts base event with optional fields', () => {
    const result = BaseEventSchema.safeParse({
      ...baseEvent,
      traceId: VALID_UUID,
      projectId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _, ...noId } = baseEvent;
    expect(BaseEventSchema.safeParse(noId).success).toBe(false);
  });
});

describe('PfcEventSchema', () => {
  it('accepts a valid PFC event', () => {
    const result = PfcEventSchema.safeParse({
      ...baseEvent,
      domain: 'pfc',
      action: 'authorize-tool',
      detail: { toolName: 'web-search' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const result = PfcEventSchema.safeParse({
      ...baseEvent,
      domain: 'pfc',
      action: 'invalid-action',
      detail: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('MemoryEventSchema', () => {
  it('accepts a valid memory event', () => {
    const result = MemoryEventSchema.safeParse({
      ...baseEvent,
      domain: 'memory',
      action: 'write',
      detail: { entryId: VALID_UUID },
    });
    expect(result.success).toBe(true);
  });
});

describe('ModelEventSchema', () => {
  it('accepts a valid model event', () => {
    const result = ModelEventSchema.safeParse({
      ...baseEvent,
      domain: 'model',
      action: 'invoke',
      detail: { providerId: VALID_UUID },
    });
    expect(result.success).toBe(true);
  });
});

describe('ToolEventSchema', () => {
  it('accepts a valid tool event', () => {
    const result = ToolEventSchema.safeParse({
      ...baseEvent,
      domain: 'tool',
      action: 'execute',
      detail: { toolName: 'calculator' },
    });
    expect(result.success).toBe(true);
  });
});

describe('ProjectEventSchema', () => {
  it('accepts a valid project event', () => {
    const result = ProjectEventSchema.safeParse({
      ...baseEvent,
      domain: 'project',
      action: 'create',
      detail: { projectName: 'Deal Scout' },
    });
    expect(result.success).toBe(true);
  });
});

describe('SystemEventSchema', () => {
  it('accepts a valid system event', () => {
    const result = SystemEventSchema.safeParse({
      ...baseEvent,
      domain: 'system',
      action: 'startup',
      detail: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('NousEventSchema (discriminated union)', () => {
  it('correctly identifies PFC event by domain', () => {
    const result = NousEventSchema.safeParse({
      ...baseEvent,
      domain: 'pfc',
      action: 'reflect',
      detail: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domain).toBe('pfc');
    }
  });

  it('correctly identifies memory event by domain', () => {
    const result = NousEventSchema.safeParse({
      ...baseEvent,
      domain: 'memory',
      action: 'retrieve',
      detail: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domain).toBe('memory');
    }
  });

  it('rejects invalid domain', () => {
    const result = NousEventSchema.safeParse({
      ...baseEvent,
      domain: 'invalid',
      action: 'something',
      detail: {},
    });
    expect(result.success).toBe(false);
  });
});
