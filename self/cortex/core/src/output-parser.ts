/**
 * Model output parser — extracts response, toolCalls, memoryCandidates.
 *
 * Phase 1 convention: plain text or JSON envelope.
 */
import {
  MemoryWriteCandidateSchema,
  type MemoryWriteCandidate,
  type TraceId,
} from '@nous/shared';

export interface ParsedModelOutput {
  response: string;
  toolCalls: Array<{ name: string; params: unknown }>;
  memoryCandidates: MemoryWriteCandidate[];
}

/**
 * Parses model output. Supports plain text or JSON envelope.
 */
export function parseModelOutput(
  output: unknown,
  traceId: TraceId,
  fallbackInput?: string,
): ParsedModelOutput {
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      if (parsed && typeof parsed.response === 'string') {
        return {
          response: parsed.response,
          toolCalls: parseToolCalls(parsed.toolCalls),
          memoryCandidates: parseMemoryCandidates(
            parsed.memoryCandidates,
            traceId,
            fallbackInput,
          ),
        };
      }
    } catch {
      // Not JSON, treat as plain text
    }
    return {
      response: output,
      toolCalls: [],
      memoryCandidates: createFallbackCandidate(traceId, fallbackInput),
    };
  }

  if (output && typeof output === 'object' && 'response' in output) {
    const obj = output as Record<string, unknown>;
    return {
      response: typeof obj.response === 'string' ? obj.response : String(output),
      toolCalls: parseToolCalls(obj.toolCalls),
      memoryCandidates: parseMemoryCandidates(
        obj.memoryCandidates,
        traceId,
        fallbackInput,
      ),
    };
  }

  return {
    response: String(output ?? ''),
    toolCalls: [],
    memoryCandidates: createFallbackCandidate(traceId, fallbackInput),
  };
}

function parseToolCalls(val: unknown): Array<{ name: string; params: unknown }> {
  if (!Array.isArray(val)) return [];
  const result: Array<{ name: string; params: unknown }> = [];
  for (const item of val) {
    if (item && typeof item === 'object' && 'name' in item) {
      const name = (item as { name: unknown }).name;
      const params = (item as { params?: unknown }).params;
      if (typeof name === 'string') {
        result.push({ name, params: params ?? {} });
      }
    }
  }
  return result;
}

function parseMemoryCandidates(
  val: unknown,
  traceId: TraceId,
  fallbackInput?: string,
): MemoryWriteCandidate[] {
  if (!Array.isArray(val)) return createFallbackCandidate(traceId, fallbackInput);
  const result: MemoryWriteCandidate[] = [];
  for (const item of val) {
    const parsed = MemoryWriteCandidateSchema.safeParse(item);
    if (parsed.success) {
      result.push(parsed.data);
    }
  }
  if (result.length === 0 && fallbackInput) {
    return createFallbackCandidate(traceId, fallbackInput);
  }
  return result;
}

function createFallbackCandidate(
  traceId: TraceId,
  fallbackInput?: string,
): MemoryWriteCandidate[] {
  if (!fallbackInput) return [];
  const content = fallbackInput.length > 200
    ? `${fallbackInput.slice(0, 197)}...`
    : fallbackInput;
  const candidate = {
    content,
    type: 'fact' as const,
    scope: 'project' as const,
    confidence: 0.5,
    sensitivity: [] as string[],
    retention: 'permanent' as const,
    provenance: {
      traceId,
      source: 'core-output-parser',
      timestamp: new Date().toISOString(),
    },
    tags: [] as string[],
  };
  const parsed = MemoryWriteCandidateSchema.safeParse(candidate);
  return parsed.success ? [parsed.data] : [];
}
