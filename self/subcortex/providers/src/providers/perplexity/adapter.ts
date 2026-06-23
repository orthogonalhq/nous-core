/**
 * Perplexity provider adapter.
 *
 * Perplexity uses the OpenAI Chat Completions wire format, so the shared
 * chat-completions adapter handles request formatting and response parsing.
 */
export {
  chatCompletionsAdapter as providerAdapter,
  createChatCompletionsAdapter,
} from '../../protocols/openai-api/adapter.js';
