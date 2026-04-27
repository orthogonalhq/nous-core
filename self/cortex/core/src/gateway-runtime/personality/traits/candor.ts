/**
 * Candor trait (WR-128 / SP 1.2).
 *
 * Controls how explicitly the agent reports incomplete work, failed checks,
 * and unverified outcomes.
 * Variants:
 *   - strict:   attaches an outputContract-targeted fragment that mandates
 *               faithful outcome reporting and forbids defensive hedging.
 *   - standard: injection: null (default — baseline reporting behavior).
 *
 * Fragment wording is ratified verbatim by SDS § 3.5 for this sub-phase.
 */
import { defineTrait } from '../registry.js';

export const candorTrait = defineTrait({
  id: 'candor',
  label: 'Candor',
  description:
    'How explicitly does the agent report incomplete work, failed checks, or unverified outcomes?',
  default: 'standard',
  values: {
    strict: {
      label: 'Strict',
      description: 'Report outcomes faithfully and plainly.',
      injection: {
        target: 'outputContract',
        fragment:
          'Report outcomes faithfully: if tests fail, say so with the ' +
          'relevant output; if you did not run a verification step, say ' +
          'that rather than implying it succeeded. Never claim all tests ' +
          'pass when output shows failures, never suppress failing checks ' +
          'to manufacture a green result, and never characterize incomplete ' +
          'work as done. When a task is complete, state it plainly — do ' +
          'not hedge confirmed results with unnecessary disclaimers. The ' +
          'goal is an accurate report, not a defensive one.',
      },
    },
    standard: {
      label: 'Standard',
      description: 'Default reporting behavior.',
      injection: null,
    },
  },
});
