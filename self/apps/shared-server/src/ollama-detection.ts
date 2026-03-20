/**
 * Ollama Detection Service — checks Ollama availability and model list.
 *
 * Used by the desktop backend to report LLM readiness to the renderer.
 */

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
  defaultModel: string | null;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Detect Ollama availability by probing its local HTTP API.
 *
 * - GET /api/tags returns the list of downloaded models.
 * - Connection refused means Ollama is not running (or not installed).
 */
export async function detectOllama(baseUrl?: string): Promise<OllamaStatus> {
  const url = `${baseUrl ?? DEFAULT_OLLAMA_BASE_URL}/api/tags`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      // Ollama is running but returned an error — still "installed"
      return { installed: true, running: true, models: [], defaultModel: null };
    }

    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (body.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);

    return {
      installed: true,
      running: true,
      models,
      defaultModel: models.length > 0 ? models[0] : null,
    };
  } catch (err: unknown) {
    // Connection refused / timeout → not running
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      // Ollama may be installed but not running — we can't distinguish without
      // checking the filesystem, so we report installed: false conservatively.
      return { installed: false, running: false, models: [], defaultModel: null };
    }

    // Any other fetch error (e.g., AbortError from timeout)
    return { installed: false, running: false, models: [], defaultModel: null };
  }
}
