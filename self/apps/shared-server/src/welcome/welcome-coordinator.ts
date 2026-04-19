/**
 * Welcome-emission coordinator (SP 1.6).
 *
 * Orchestrates the one-shot welcome turn per Decision 6 § Mechanism and
 * SP 1.6 SDS § 1.3. The set-after-successful-emission ordering is binding
 * (SDS § 0 Note 3): the persisted `welcomeMessageSent` flag is written ONLY
 * after the gateway runtime returns a non-empty assistant response AND that
 * response has been appended to STM. Any earlier failure leaves the flag
 * `false` for the next mount to retry.
 *
 * The coordinator does not throw — failure modes are returned as
 * `{ welcomeFired: false, reason: ... }`. The renderer's `.catch()` is
 * defensive only; transport-layer failures (network, serialization) are the
 * only path that surfaces a throw at the call site.
 */
import { randomUUID } from 'node:crypto';
import type { IPrincipalSystemGatewayRuntime } from '@nous/cortex-core';
import type { IConfig, IStmStore, ProjectId, TraceId } from '@nous/shared';
import { WELCOME_SEED_FRAGMENT } from './welcome-seed.js';

/**
 * Subset of the `IConfig` surface the coordinator depends on. Restricting
 * to these three methods keeps the coordinator's contract narrow and the
 * unit-test mocks small.
 */
export type WelcomeConfigManager = Pick<
  IConfig,
  'getWelcomeMessageSent' | 'setWelcomeMessageSent' | 'getPersonalityConfig'
>;

export interface WelcomeLogChannel {
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface WelcomeCoordinatorDeps {
  gatewayRuntime: IPrincipalSystemGatewayRuntime;
  configManager: WelcomeConfigManager;
  stmStore: IStmStore;
  log?: WelcomeLogChannel;
  now?: () => string;
}

export type WelcomeFireResult =
  | { welcomeFired: true; traceId: string }
  | {
      welcomeFired: false;
      reason:
        | 'already_sent'
        | 'composition_error'
        | 'empty_response'
        | 'stm_append_error'
        | 'no_project_id';
    };

interface WelcomeFireArgs {
  projectId?: string;
}

export async function fireWelcomeIfUnsent(
  deps: WelcomeCoordinatorDeps,
  args: WelcomeFireArgs,
): Promise<WelcomeFireResult> {
  // Step 0: idempotency check (cross-mount).
  if (deps.configManager.getWelcomeMessageSent()) {
    return { welcomeFired: false, reason: 'already_sent' };
  }

  // V1 defensive guard. The renderer always passes the dockview panel's
  // active project id; absence indicates an unexpected init order.
  if (!args.projectId) {
    return { welcomeFired: false, reason: 'no_project_id' };
  }

  const traceId = randomUUID() as TraceId;

  // Step 1: compose via the production prompt path.
  // Pass `projectId: undefined` to `handleChatTurn` so it skips its own
  // STM finalization (`finalizeChatStmTurn` early-returns on missing
  // projectId; principal-system-runtime.ts:828). This keeps the seed
  // fragment from being persisted as a `user`-role STM entry; we manually
  // append only the assistant entry below.
  let composeResult: {
    response: string;
    traceId: string;
    contentType?: 'text' | 'openui';
  };
  try {
    composeResult = await deps.gatewayRuntime.handleChatTurn({
      message: WELCOME_SEED_FRAGMENT,
      projectId: undefined,
      traceId,
    });
  } catch (err) {
    deps.log?.warn(
      '[nous:welcome] composition failed; flag remains unset for retry',
      { error: String(err) },
    );
    return { welcomeFired: false, reason: 'composition_error' };
  }

  if (!composeResult.response || composeResult.response.trim().length === 0) {
    deps.log?.warn(
      '[nous:welcome] composer returned empty response; flag remains unset for retry',
    );
    return { welcomeFired: false, reason: 'empty_response' };
  }

  // Step 2: append the assistant entry to STM as a normal agent message.
  // No special metadata field, no `type: 'welcome'` (Goals C9).
  const timestamp = (deps.now ?? (() => new Date().toISOString()))();
  const entry: {
    role: 'assistant';
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  } = {
    role: 'assistant',
    content: composeResult.response,
    timestamp,
  };
  if (composeResult.contentType && composeResult.contentType !== 'text') {
    entry.metadata = { contentType: composeResult.contentType };
  }

  try {
    await deps.stmStore.append(args.projectId as ProjectId, entry);
  } catch (err) {
    deps.log?.warn(
      '[nous:welcome] STM append failed; flag remains unset for retry',
      { error: String(err) },
    );
    return { welcomeFired: false, reason: 'stm_append_error' };
  }

  // Step 3: set the flag (set-after-successful-emission per SDS § 0 Note 3).
  await deps.configManager.setWelcomeMessageSent(true);
  deps.log?.info('[nous:welcome] welcome emitted and flag set', {
    traceId,
    projectId: args.projectId,
  });

  return { welcomeFired: true, traceId };
}
