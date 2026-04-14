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
  toolCalls: Array<{ name: string; params: unknown; id?: string }>;
  memoryCandidates: MemoryWriteCandidate[];
  contentType?: 'text' | 'openui';
  /** Extended thinking / reasoning trace from the provider. Populated by adapters (SP 1.3). */
  thinkingContent?: string;
}

const OPENUI_PREFIX = '%%openui\n';

/**
 * Detect whether a response contains OpenUI card content.
 * Checks for `%%openui\n` prefix (legacy, stripped when present) and
 * inline card tag patterns (`<StatusCard`, `<ActionCard`, etc.).
 * Returns the (possibly stripped) response and contentType.
 */
function detectContentType(response: string): { response: string; contentType: 'text' | 'openui' } {
  // 1. Strip %%openui\n prefix if present (backward compat)
  let stripped = response;
  let hadPrefix = false;
  if (response.startsWith(OPENUI_PREFIX)) {
    stripped = response.slice(OPENUI_PREFIX.length);
    hadPrefix = true;
  }

  // 2. Check for registered card tag patterns inline
  const CARD_TAG_PATTERNS = [
    '<StatusCard',
    '<ActionCard',
    '<ApprovalCard',
    '<WorkflowCard',
    '<FollowUpBlock',
  ];
  const hasCardTag = CARD_TAG_PATTERNS.some(pattern => stripped.includes(pattern));

  // 3. If prefix was present OR card tags found, it's openui content
  if (hadPrefix || hasCardTag) {
    return { response: stripped, contentType: 'openui' };
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

// ── Narration detection and stripping ────────────────────────────────────────

/**
 * Narrow narration markers — these exact strings indicate chain-of-thought
 * narration leaked into model output. Only these specific patterns trigger
 * detection; generic Markdown headings like `## Summary` do NOT match.
 */
const NARRATION_MARKERS: readonly string[] = [
  '## Handling User Chat Turn',
  '### Tool Execution',
  'tool_execute(',
  'task_complete(output=',
  'response = tool_execute(',
] as const;

/**
 * Regex pattern for `### Step N:` narration headers.
 */
const STEP_PATTERN = /^### Step \d+:/m;

/**
 * Regex to find the `## Final Response` section header.
 * Extracts everything after this header as the clean response.
 */
const FINAL_RESPONSE_HEADER = /^## Final Response\s*$/m;

/**
 * Regex to find JSON code blocks containing a `"response":` field.
 * Uses global flag to find the last match.
 */
const JSON_RESPONSE_BLOCK = /```(?:json)?\s*\n(\{[\s\S]*?"response"\s*:[\s\S]*?\})\s*\n```/g;

/**
 * Ordered extraction heuristic — attempts to extract the actual user-facing
 * response from narrated model output. Returns `null` when no extraction
 * succeeds (triggers fallback to original content).
 *
 * Order:
 * 1. `## Final Response` section — highest-priority signal
 * 2. Last JSON code block with `"response":` field
 * 3. Last substantive paragraph (no `#` prefix, no `tool_` patterns)
 */
function extractCleanResponse(content: string): string | null {
  // 1. Final Response section
  const finalMatch = FINAL_RESPONSE_HEADER.exec(content);
  if (finalMatch) {
    const afterHeader = content.slice(finalMatch.index + finalMatch[0].length).trim();
    if (afterHeader.length > 0) {
      return afterHeader;
    }
  }

  // 2. Last JSON block with "response" key
  let lastJsonMatch: RegExpExecArray | null = null;
  // Reset lastIndex before iterating (global regex)
  JSON_RESPONSE_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JSON_RESPONSE_BLOCK.exec(content)) !== null) {
    lastJsonMatch = match;
  }
  if (lastJsonMatch) {
    try {
      const parsed = JSON.parse(lastJsonMatch[1]) as Record<string, unknown>;
      if (typeof parsed.response === 'string' && parsed.response.trim().length > 0) {
        return parsed.response.trim();
      }
    } catch {
      // JSON parse failed — fall through to next heuristic
    }
  }

  // 3. Last substantive paragraph
  const paragraphs = content.split(/\n\n+/);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const para = paragraphs[i].trim();
    if (
      para.length > 0 &&
      !para.startsWith('#') &&
      !para.includes('tool_execute(') &&
      !para.includes('task_complete(') &&
      !para.includes('response = tool_execute(')
    ) {
      return para;
    }
  }

  return null;
}

/**
 * Detects chain-of-thought narration in model output and extracts the
 * actual user-facing response.
 *
 * Uses narrow pattern matching (6 specific markers) to avoid false positives
 * on legitimate Markdown content. When narration is detected, applies an
 * ordered extraction heuristic to find the clean response.
 *
 * **Never-empty invariant:** If all extraction heuristics fail, returns the
 * original content unchanged with `wasNarrated: false`.
 *
 * @param content - Raw response content string
 * @param providerId - Optional provider identifier for future per-provider normalizers
 * @returns Object with `cleaned` (the response text) and `wasNarrated` (detection flag)
 */
export function detectAndStripNarration(
  content: string,
  providerId?: string,
): { cleaned: string; wasNarrated: boolean } {
  // Empty input passthrough
  if (content.length === 0) {
    return { cleaned: content, wasNarrated: false };
  }

  // Provider switch structure — V1 uses default path only
  switch (providerId) {
    // Future per-provider normalizers go here:
    // case 'openai': return openaiNormalizer(content);
    // case 'anthropic': return anthropicNormalizer(content);
    default:
      break;
  }

  // Check for narration markers
  const hasNarration =
    NARRATION_MARKERS.some(marker => content.includes(marker)) ||
    STEP_PATTERN.test(content);

  if (!hasNarration) {
    return { cleaned: content, wasNarrated: false };
  }

  // Narration detected — attempt extraction
  const extracted = extractCleanResponse(content);

  // Never-empty guard: if extraction fails, return original
  if (extracted === null || extracted.trim().length === 0) {
    return { cleaned: content, wasNarrated: false };
  }

  return { cleaned: extracted, wasNarrated: true };
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
