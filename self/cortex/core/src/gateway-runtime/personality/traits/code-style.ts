/**
 * Code-style trait (WR-128 / SP 1.2).
 *
 * Controls how the agent authors code comments and presents code.
 * Variants:
 *   - minimal:  attaches an identity-targeted fragment that keeps comments
 *               focused on non-obvious WHYs.
 *   - standard: injection: null (default — baseline commenting behavior).
 *
 * Filename is hyphenated; the trait id is camelCase (`codeStyle`) per
 * SDS § 1.3 and Decision 1.
 * Fragment wording is ratified verbatim by SDS § 3.5.
 */
import { defineTrait } from '../registry.js';

export const codeStyleTrait = defineTrait({
  id: 'codeStyle',
  label: 'Code Style',
  description: 'How the agent authors code comments and presents code.',
  default: 'standard',
  values: {
    minimal: {
      label: 'Minimal',
      description: 'Comment only when the WHY is non-obvious.',
      injection: {
        target: 'identity',
        fragment:
          'Default to writing no comments. Only add one when the WHY is ' +
          'non-obvious: a hidden constraint, a subtle invariant, a ' +
          'workaround for a specific bug, behavior that would surprise a ' +
          'reader. Do not explain WHAT the code does — well-named ' +
          'identifiers already do that. Do not reference the current task, ' +
          'fix, or callers — those belong in the PR description. Do not ' +
          'remove existing comments unless you are removing the code they ' +
          'describe or know they are wrong.',
      },
    },
    standard: {
      label: 'Standard',
      description: 'Default commenting behavior.',
      injection: null,
    },
  },
});
