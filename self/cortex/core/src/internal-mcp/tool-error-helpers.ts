/**
 * Tool error helpers — Enriched error contract for the Cortex agent gateway.
 *
 * Producer (this module): the `ScopedMcpToolSurface` calls
 * `buildUnknownToolError` from each of its four "tool not available" throw
 * sites. The resulting `NousError` carries a structured `ToolErrorPayload`
 * on its `context` field.
 *
 * Consumer: the gateway's recovery-frame builder (`buildToolErrorFrame` in
 * `agent-gateway.ts`) inspects `NousError.context` via `isToolErrorPayload`
 * and, when a payload is present, surfaces `tool_error_kind` into the
 * `tool_error` frame's metadata so the model can self-correct on the next
 * turn.
 *
 * The same helper-set also exposes `isZodLikeError` and `formatZodMessage`
 * so the surface can translate Zod validation failures into structured
 * `arguments_invalid` errors at one boundary site.
 */
import { NousError } from '@nous/shared';

/**
 * Discriminator on the structured payload of an enriched tool-error NousError.
 * Used by the gateway recovery-frame builder to branch on failure class and
 * by future consumers (UI, witness) to render or log per-class.
 */
export type ToolErrorKind = 'unknown_tool' | 'arguments_invalid' | 'tool_runtime_error';

/**
 * Structured payload carried on `NousError.context` for enriched tool errors.
 * Additive on the open `Record<string, unknown>` context shape — no breaking
 * change to existing NousError consumers.
 */
export interface ToolErrorPayload {
  tool_error_kind: ToolErrorKind;
  requested_tool: string;
  available_tools?: readonly string[];
  suggestions?: readonly string[];
}

/**
 * Builds an enriched unknown-tool NousError. The same helper is invoked by
 * ALL FOUR throw sites in ScopedMcpToolSurface.executeTool (lines 54-58,
 * 63-66, 71-75, 78-82) so the recovery-frame contract for "you asked for a
 * tool you can't use" is identical regardless of WHY the tool was unavailable.
 *
 * `available` MUST be the canonical-name list authorized for the calling
 * agent class (catalog tools the agent can see + dynamic tools visible to
 * the agent). The caller (ScopedMcpToolSurface) computes this from its own
 * authorization state — the helper does no membership lookup itself.
 */
export function buildUnknownToolError(args: {
  requestedName: string;
  agentClass: string;
  available: readonly string[];
}): NousError {
  const suggestions = args.available
    .filter((candidate) => isSimilarToolName(args.requestedName, candidate))
    .slice(0, 3); // bound — at most 3 suggestions per error
  const messageParts = [
    `Tool ${args.requestedName} is not available for ${args.agentClass}.`,
    `Available tools: ${args.available.join(', ')}.`,
  ];
  if (suggestions.length > 0) {
    messageParts.push(`Did you mean: ${suggestions.join(', ')}?`);
  }
  const payload: ToolErrorPayload = {
    tool_error_kind: 'unknown_tool',
    requested_tool: args.requestedName,
    available_tools: args.available,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
  return new NousError(
    messageParts.join(' '),
    'TOOL_NOT_AVAILABLE',
    payload as unknown as Record<string, unknown>,
  );
}

/**
 * Type guard for the ToolErrorPayload structure on a NousError context.
 * Used by the gateway's handleStandardTool catch branch to decide whether
 * to build a structured recovery frame or fall through to normalizeToolError.
 */
export function isToolErrorPayload(value: unknown): value is ToolErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.tool_error_kind === 'string' &&
    typeof obj.requested_tool === 'string' &&
    (obj.tool_error_kind === 'unknown_tool' ||
      obj.tool_error_kind === 'arguments_invalid' ||
      obj.tool_error_kind === 'tool_runtime_error')
  );
}

/**
 * Pure name-similarity heuristic. Returns true when `candidate` is plausibly
 * the canonical name the model meant when it emitted `requested`.
 *
 * Rules (cheap, non-flaky, both case-insensitive):
 *  1. Substring overlap of length >= 4 in EITHER direction
 *     (e.g., requested='workflow_manager.list_workflows', candidate='workflow_list'
 *     — 'workflow' is shared 8 chars; matches).
 *  2. OR Levenshtein distance <= 4 between the lowercased names.
 *
 * Returns false on empty strings or identical strings (identical means we'd
 * suggest the same thing the model emitted — useless).
 */
export function isSimilarToolName(requested: string, candidate: string): boolean {
  if (!requested || !candidate) return false;
  const a = requested.toLowerCase();
  const b = candidate.toLowerCase();
  if (a === b) return false;
  // Rule 1: shared substring of length >= 4.
  if (sharesSubstringOfLength(a, b, 4)) return true;
  // Rule 2: Levenshtein distance <= 4.
  return levenshteinDistance(a, b) <= 4;
}

function sharesSubstringOfLength(a: string, b: string, n: number): boolean {
  if (a.length < n || b.length < n) return false;
  for (let i = 0; i <= a.length - n; i += 1) {
    const slice = a.substring(i, i + n);
    if (b.includes(slice)) return true;
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  // Two-row dynamic programming. O(a.length * b.length) time, O(min) space.
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Detect Zod-shaped errors (direct ZodError instances OR any object that
 * carries an `.issues: unknown[]` field — covers wrapped/normalized variants
 * downstream callers may produce).
 *
 * This is intentionally a structural check rather than `instanceof z.ZodError`
 * because importing Zod here just for instanceof would create an unwanted
 * runtime dependency on the validation library from the helper module.
 */
export function isZodLikeError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  // Zod v3: ZodError extends Error and has .issues: ZodIssue[]
  if (Array.isArray(obj.issues)) return true;
  // ZodError class name probe (in case .issues is omitted by some toJSON path)
  if (obj.constructor && (obj.constructor as { name?: string }).name === 'ZodError') return true;
  // Some downstream wrappers expose `.errors` instead of `.issues`
  if (Array.isArray(obj.errors) && obj.name === 'ZodError') return true;
  return false;
}

/**
 * Format a Zod-shaped error into a single-line human-readable summary
 * suitable for inclusion in the recovery-frame message body.
 *
 * Each issue is rendered as `<path>: <message>`. Paths default to `(root)`
 * when empty. Multiple issues are joined with `; `. Output is bounded —
 * truncates at 500 chars to protect against pathological deep schemas.
 */
export function formatZodMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e);
  const obj = e as { issues?: unknown[]; errors?: unknown[]; message?: string };
  const issues = Array.isArray(obj.issues)
    ? obj.issues
    : Array.isArray(obj.errors)
      ? obj.errors
      : null;
  if (!issues || issues.length === 0) {
    return typeof obj.message === 'string' ? obj.message : String(e);
  }
  const summarized = issues
    .map((issue) => {
      if (!issue || typeof issue !== 'object') return String(issue);
      const i = issue as { path?: unknown; message?: string };
      const pathArr = Array.isArray(i.path) ? i.path : [];
      const path = pathArr.length > 0 ? pathArr.join('.') : '(root)';
      return `${path}: ${i.message ?? '(no message)'}`;
    })
    .join('; ');
  return summarized.length > 500 ? `${summarized.slice(0, 497)}...` : summarized;
}
