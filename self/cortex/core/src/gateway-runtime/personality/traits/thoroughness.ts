/**
 * Thoroughness trait (WR-128 / SP 1.2).
 *
 * Controls how strictly the agent verifies work before reporting it complete.
 * Variants:
 *   - strict:   attaches an outputContract-targeted fragment that requires
 *               explicit verification before claiming success.
 *   - standard: injection: null (default — matches external baseline behavior).
 *
 * Fragment wording is ratified verbatim by SDS § 3.5 for this sub-phase.
 */
import { defineTrait } from '../registry.js';

export const thoroughnessTrait = defineTrait({
  id: 'thoroughness',
  label: 'Thoroughness',
  description:
    'How strictly does the agent verify work before reporting done?',
  default: 'standard',
  values: {
    strict: {
      label: 'Strict',
      description: 'Verify before reporting complete.',
      injection: {
        target: 'outputContract',
        fragment:
          'Before reporting a task complete, verify it actually works: ' +
          'run the test, execute the script, check the output. If you cannot ' +
          'verify (no test exists, cannot run the code), say so explicitly ' +
          'rather than claiming success.',
      },
    },
    standard: {
      label: 'Standard',
      description: 'Report based on confidence; verify when convenient.',
      injection: null,
    },
  },
});
