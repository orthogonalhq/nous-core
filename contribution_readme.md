# OpenRouter Model Provider

## Solution Approach

### Analysis
Nous lacked a selectable OpenRouter provider. OpenRouter is an OpenAI Chat Completions-compatible aggregator (500+ models, Bearer auth), so it is implemented by reusing the existing `ChatCompletionsProvider` — no changes to core interfaces.

### Proposed Solution
Add a certified provider **leaf** under `self/subcortex/providers/src/providers/openrouter/`, mirroring the merged **Groq** leaf (the canonical OpenAI-compatible cloud reference). The maintainer's registry-driven refactor on the integration branch means the leaf alone surfaces OpenRouter in API-key settings and auto-discovers its full model catalog — no app/server/UI code.

### Implementation Plan (UMPIRE)

**Understand:** Nous had no OpenRouter provider. OpenAI-compatible → reuse `ChatCompletionsProvider` (`src/protocols/openai-api/`) without touching `IModelProvider` or `TextModelInputSchema`.

**Match:** Reuse `ChatCompletionsProvider`; mirror the leaf structure of `providers/groq/` (OpenAI-compatible cloud reference) and `providers/openai/`; register via the `generate:providers` codegen script; rely on the registry-driven `provider-model-discovery.ts` for model listing.

**Plan:**
1. Create `src/providers/openrouter/` — `definition.ts` (`OPENROUTER_PROVIDER_DEFINITION`, `vendorKey: 'openrouter'`, **no hand-authored UUID** — derived from `vendorKey`), `adapter.ts` (re-export `chatCompletionsAdapter`), `provider.ts` (factory → `ChatCompletionsProvider`), `index.ts` (barrel).
2. Run `pnpm --filter @nous/subcortex-providers run generate:providers` to regenerate catalogs.
3. Add `src/__tests__/providers/openrouter.test.ts`; update the existing aggregate tests for the new vendor.
4. Verify: `check:generated`, tests, typecheck, lint, build.

**Implement:** Branch `feat/openrouter-provider-leaf`, based on the integration branch `feat/contributor-friendly-inference-provider-surface` (PR target per maintainer). Directory: `self/subcortex/providers/src/providers/openrouter/`.

**Review:**
- [x] `definition.ts` does **not** hand-author `wellKnownProviderId` — built-in IDs derive from `vendorKey` via `provider-identity.ts` (corrects the original draft).
- [x] `generate:providers` added the vendor to `provider-factories.ts`, `provider-definitions.ts`, and `provider-adapters.ts`.
- [x] Core interfaces untouched (`IModelProvider`, `TextModelInputSchema`); no `@nous/shared` edits.

**Evaluate:** `check:generated` (in sync), provider tests, shared-server discovery/preferences tests, typecheck, lint, build — all green (see Testing Strategy).

---

## Testing Strategy

### Unit Tests (`src/__tests__/providers/openrouter.test.ts`)
- [x] Definition metadata correct: `vendorKey`/`displayName`/`protocol:'chat-completions'`/`adapterKey:'chat-completions'`/`defaultEndpoint:'https://openrouter.ai/api'`/`defaultModelId:'openrouter/auto'`/`auth.envVar:'OPENROUTER_API_KEY'`/`auth.header:{name:'Authorization',scheme:'bearer'}`/`modelListEndpoint:'/v1/models'`/`modelListFormat:'openai-models'`.
- [x] Capabilities advertise `streaming` + `modelListing`; `nativeToolUse` intentionally absent (pending #390 tool-use bridge).
- [x] No hand-authored `wellKnownProviderId`; hydrated definition passes `ProviderDefinitionSchema`.
- [x] Factory builds a `ChatCompletionsProvider` for vendor `openrouter` (config id via `deriveBuiltInProviderId('openrouter')`).

### Integration Tests (existing aggregate suites, updated for the new vendor)
- [x] `provider-codegen.test.ts` — leaf discovered; generated catalogs in sync.
- [x] `provider-definitions.test.ts` — `PROVIDER_DEFINITIONS` includes `openrouter` with correct endpoint/model/envVar.
- [x] `provider-definition-types.test.ts` — `ProviderVendorKey`/`BootstrapProviderKey` unions include `openrouter`.
- [x] `provider-pipeline-integration.test.ts` — registry constructs OpenRouter as `ChatCompletionsProvider` from definition + `OPENROUTER_API_KEY`.
- [x] `adapter-resolver.test.ts` — `ADAPTER_MODULES` aggregation (also fixed a pre-existing staleness; see Notes).
- [x] Shared-server `provider-model-discovery` + `preferences-router` tests stay green — they are generic/definition-driven, so OpenRouter needs no per-vendor code.

Results: provider package **328 passed / 2 skipped**; shared-server discovery+preferences **33 passed** (incl. a new OpenRouter-shaped discovery test).

### Manual Testing (`pnpm dev:web`, port 4317)
- [x] OpenRouter appears in Settings → API Keys provider dropdown (leaf registration confirmed).
- [x] API key stored and the integration connects.
- [x] **Model picker lists OpenRouter's full catalog** after a small fix to an over-strict shared discovery parser (see "Model discovery fix" below). Before the fix it fell back to only `openrouter/auto`, which auto-routes to a GPT model.

---

## Implementation Notes

### Progress
Implemented the OpenRouter leaf mirroring the merged Groq leaf; regenerated catalogs; added/updated tests; full local verification green.

### Key decisions & challenges
- **Targeted the integration branch.** Per maintainer guidance the PR targets `feat/contributor-friendly-inference-provider-surface`, which carries the new provider surface (`ProviderDefinitionLeaf`, IDs derived from `vendorKey`, registry-driven model discovery). Worked on a fresh `feat/openrouter-provider-leaf` cut from that tip.
- **No hand-authored UUID / no manual `index.ts` export** (corrects the original draft): IDs derive from `vendorKey`; the definition is surfaced transitively via the regenerated `provider-definitions.ts` (same as Groq).
- **Mostly leaf-driven:** the maintainer's discovery refactor (`provider-model-discovery.ts` + generic `preferences.ts` + dynamic `ApiKeysPage.tsx`) surfaces OpenRouter's API-key entry automatically from the definition's `auth.header` + `modelListEndpoint` + `modelListFormat`.
- **Model discovery fix (the one non-leaf change):** the shared `openai-models` parser required per-item `object`/`owned_by` and a top-level `object` that OpenRouter's `/v1/models` omits, so discovery fell back to only `openrouter/auto`. Made those three fields `.optional()` in `provider-model-discovery.ts` (OpenAI still validates; OpenRouter now lists its full catalog) and added an OpenRouter-shaped discovery test. Confirmed first-hand via `pnpm dev:web`.
- **Pre-existing test staleness found & fixed:** `adapter-resolver.test.ts > aggregates all canonical adapter modules` was already failing on the integration tip (the llama-cpp leaf added a `chat-completions` provider without updating the expected list). Verified by stashing my changes and running it on the pristine tip. Updated it to reflect all four `chat-completions` leaves (groq, llama-cpp, openai, openrouter).
- **Pre-existing typecheck break (flagged, NOT touched):** `@nous/shared-server` typecheck fails on the integration tip at `bootstrap.ts:1335` (`cliSessionManager` not in `PrincipalSystemGatewayRuntimeDeps`) — unrelated to this work, confirmed present with my changes stashed. Reported, not fixed.
- **Windows line endings:** regenerated catalogs briefly became CRLF locally after a git stash round-trip (`core.autocrlf=true`); re-running the generator restored LF. Committed bytes are LF, matching the repo, so CI is unaffected.

### Code Changes
- **Files added:** `providers/openrouter/{definition,adapter,provider,index}.ts`; `__tests__/providers/openrouter.test.ts`.
- **Files modified (regenerated):** `provider-adapters.ts`, `provider-definitions.ts`, `provider-factories.ts`.
- **Files modified (discovery fix):** `self/apps/shared-server/src/provider-model-discovery.ts` (3 `.optional()` on the `openai-models` schema) + `self/apps/shared-server/__tests__/provider-model-discovery.test.ts` (new OpenRouter-shape case).
- **Tests updated:** `adapter-resolver.test.ts`, `provider-codegen.test.ts`, `provider-definitions/provider-definition-types.test.ts`, `provider-definitions/provider-definitions.test.ts`, `provider-pipeline-integration.test.ts`.
- **Approach decisions:** reuse `ChatCompletionsProvider` (no custom protocol code); zero core-interface changes; one minimal shared-parser fix to make discovery work for OpenRouter.

---

## Pull Request

**PR Link:** https://github.com/orthogonalhq/nous-core/pull/410
**Target branch:** `feat/contributor-friendly-inference-provider-surface`

**PR Description (draft):**
> Adds a certified OpenRouter provider leaf (`self/subcortex/providers/src/providers/openrouter/`). OpenRouter is OpenAI Chat Completions-compatible, so the leaf carries only OpenRouter metadata and reuses the shared `ChatCompletionsProvider`, mirroring the Groq leaf. Built-in ID derives from `vendorKey`; catalogs regenerated via `generate:providers`. OpenRouter appears in API-key settings and its full model catalog is discovered via the registry-driven model discovery.
>
> **Model discovery fix:** the shared `openai-models` parser in `provider-model-discovery.ts` required per-item `object`/`owned_by` and a top-level `object` that OpenRouter's `/v1/models` omits, so discovery fell back to only `openrouter/auto`. Made those three fields `.optional()` (OpenAI still validates; OpenRouter now lists its full catalog) + added an OpenRouter-shape test. Heads up: this touches your in-flight discovery file — easy to drop if you'd rather fold it into your own patch.
>
> **Also flags:** (1) a pre-existing failure in `adapter-resolver.test.ts` — the llama-cpp leaf added a `chat-completions` provider without updating the expected `ADAPTER_MODULES` list (fixed here); (2) a pre-existing `@nous/shared-server` typecheck error at `bootstrap.ts:1335` (`cliSessionManager`), unrelated to this PR and present on the integration tip (left untouched).
>
> Verification: `check:generated` in sync; provider tests 328 passed; shared-server discovery/preferences 33 passed; lint 0 errors; provider typecheck + build green. Scope: `IModelProvider` and `TextModelInputSchema` untouched.

**Maintainer Feedback:**
- _(log dates + responses as received)_

**Status:** Implemented & verified locally — awaiting commit/push/PR.

---

## Model discovery fix (resolved in this PR)

**Symptom (before fix):** With a valid OpenRouter key, the model picker listed only `openrouter/auto` (which auto-routes to a GPT model). OpenRouter's full catalog never appeared, so a specific model couldn't be selected.

**Root cause:** The shared discovery parser `self/apps/shared-server/src/provider-model-discovery.ts` validates `modelListFormat: 'openai-models'` responses with a strict schema that **requires** a top-level `object` and per-item `object` + `owned_by`:
```ts
const OpenAIModelSchema = z.object({ id: z.string(), object: z.string(), owned_by: z.string() });
const OpenAIModelsResponseSchema = z.object({ data: z.array(OpenAIModelSchema), object: z.string() });
```
OpenRouter's `GET https://openrouter.ai/api/v1/models` is OpenAI-compatible but richer and omits those fields. Verified live:
- top-level keys: `['data']` (no `object`)
- first item keys: `id, canonical_slug, hugging_face_id, name, created, description, context_length, architecture, pricing, top_provider, …` — **no `object`, no `owned_by`**

So `safeParse` fails → `fetchProviderModels` returns `fallbackModelsFor(definition)` (just the `defaultModelId`, `openrouter/auto`).

**Fix applied:** made `object`/`owned_by` (per item) and the top-level `object` `.optional()` in `OpenAIModelsResponseSchema`. OpenAI still validates (it sends those fields); OpenRouter then lists its full catalog. Benefits every OpenAI-compatible provider. (Groq returns `object`/`owned_by`, so it was unaffected; OpenRouter is the divergent case.) Covered by a new OpenRouter-shape case in `provider-model-discovery.test.ts`.

**Heads up for the maintainer:** `provider-model-discovery.ts` is in your actively-refactored area — if you'd rather fold this into your own model-discovery patch, this 3-line change is trivial to drop.
