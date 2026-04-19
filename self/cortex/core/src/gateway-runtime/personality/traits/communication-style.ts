/**
 * Communication-style trait (WR-128 / SP 1.2).
 *
 * Controls the prose style the agent uses for user-facing text.
 * Variants:
 *   - detailed: attaches an outputContract-targeted fragment that mandates
 *               readable prose and calibrated length.
 *   - concise:  injection: null (default — short, task-fit responses).
 *
 * Filename is hyphenated; the trait id is camelCase (`communicationStyle`)
 * per SDS § 1.3 and Decision 1.
 * Fragment wording is ratified verbatim by SDS § 3.5.
 */
import { defineTrait } from '../registry.js';

export const communicationStyleTrait = defineTrait({
  id: 'communicationStyle',
  label: 'Communication Style',
  description: 'Prose style for user-facing text.',
  default: 'concise',
  values: {
    detailed: {
      label: 'Detailed',
      description: 'Complete sentences; expand terms that help.',
      injection: {
        target: 'outputContract',
        fragment:
          'When sending user-facing text, you are writing for a person, ' +
          'not logging to a console. Assume users can only see your text ' +
          'output. Use complete, grammatically correct sentences without ' +
          'unexplained jargon. Expand technical terms where they help. ' +
          'Match responses to the task: a simple question gets a direct ' +
          'answer in prose, not headers and numbered sections. Keep ' +
          'communication clear and concise, free of fluff. Avoid filler ' +
          'or stating the obvious. Get straight to the point.',
      },
    },
    concise: {
      label: 'Concise',
      description: 'Match response length to the task; skip filler.',
      injection: null,
    },
  },
});
