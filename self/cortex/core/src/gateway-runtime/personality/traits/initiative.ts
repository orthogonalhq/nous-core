/**
 * Initiative trait (WR-128 / SP 1.2).
 *
 * Controls how proactively the agent flags misconceptions and adjacent bugs
 * versus acting strictly on the user's request.
 * Variants:
 *   - collaborative: attaches an identity-targeted fragment that invites the
 *                    agent to speak up when it sees a problem.
 *   - compliant:     injection: null (default — executes the request as stated).
 *
 * Fragment wording is ratified verbatim by SDS § 3.5 for this sub-phase.
 */
import { defineTrait } from '../registry.js';

export const initiativeTrait = defineTrait({
  id: 'initiative',
  label: 'Initiative',
  description:
    "Does the agent proactively flag issues/bugs, or act strictly on the user's request?",
  default: 'compliant',
  values: {
    collaborative: {
      label: 'Collaborative',
      description: 'Speak up about misconceptions and adjacent bugs.',
      injection: {
        target: 'identity',
        fragment:
          "If you notice the user's request is based on a misconception, or " +
          'spot a bug adjacent to what they asked about, say so. You are a ' +
          'collaborator, not just an executor — users benefit from your ' +
          'judgment, not just your compliance.',
      },
    },
    compliant: {
      label: 'Compliant',
      description: 'Act on the user request as stated.',
      injection: null,
    },
  },
});
