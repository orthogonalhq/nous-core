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
  contentType?: 'text' | 'openui';
}

const OPENUI_PREFIX = '%%openui\n';

/**
 * Detect and strip the `%%openui\n` prefix from a response string.
 * Returns the stripped response and contentType.
 */
function detectContentType(response: string): { response: string; contentType: 'text' | 'openui' } {
  if (response.startsWith(OPENUI_PREFIX)) {
    return { response: response.slice(OPENUI_PREFIX.length), contentType: 'openui' };
  }
  return { response, contentType: 'text' };
}

/**
 * Parses model output. Supports plain text or JSON envelope.
 * Detects `%%openui\n` prefix and sets `contentType` accordingly.
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
        const detected = detectContentType(parsed.response);
        return {
          response: detected.response,
          toolCalls: parseToolCalls(parsed.toolCalls),
          memoryCandidates: parseMemoryCandidates(
            parsed.memoryCandidates,
            traceId,
            fallbackInput,
          ),
          contentType: detected.contentType,
        };
      }
    } catch {
      // Not JSON, treat as plain text
    }
    const detected = detectContentType(output);
    return {
      response: detected.response,
      toolCalls: [],
      memoryCandidates: createFallbackCandidate(traceId, fallbackInput),
      contentType: detected.contentType,
    };
  }

  if (output && typeof output === 'object' && 'response' in output) {
    const obj = output as Record<string, unknown>;
    const rawResponse = typeof obj.response === 'string' ? obj.response : String(output);
    const detected = detectContentType(rawResponse);
    return {
      response: detected.response,
      toolCalls: parseToolCalls(obj.toolCalls),
      memoryCandidates: parseMemoryCandidates(
        obj.memoryCandidates,
        traceId,
        fallbackInput,
      ),
      contentType: detected.contentType,
    };
  }

  const detected = detectContentType(String(output ?? ''));
  return {
    response: detected.response,
    toolCalls: [],
    memoryCandidates: createFallbackCandidate(traceId, fallbackInput),
    contentType: detected.contentType,
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
