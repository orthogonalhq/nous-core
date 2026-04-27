/**
 * V1 welcome seed fragment per Decision 6 § Composition detail and
 * SP 1.6 SDS § 0 Note 2. Plain enough that any V1 personality preset
 * (`balanced`, `professional`, `casual`) renders it naturally.
 *
 * The gateway's system prompt (composed once at gateway construction time
 * via `composeFromProfile` — see `principal-system-runtime.ts:247-252` for
 * the Principal gateway and `:280-285` for the System gateway) carries the
 * personality, while this seed enters as the first user-message payload at
 * request time (see `principal-system-runtime.ts:475`). The personality
 * dominates output tone via the system-prompt-vs-user-message dynamic, not
 * via post-seed identity-fragment composition.
 *
 * Per-word preset-neutrality justification lives in SP 1.6 SDS § 0 Note 2.
 * Re-wording requires a new ratified decision (replacing/amending Decision 6)
 * or an ADR documenting the change.
 */
export const WELCOME_SEED_FRAGMENT =
  'This is your first interaction with the user. Greet them warmly and offer to help.';
