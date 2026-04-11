/**
 * Behavioral Testing Round Artifact Generator
 *
 * Generates BT round artifacts matching the SOP format defined in:
 * .skills/engineer-workflow-sop/orchestrator/templates/behavioral-testing-round.md
 *
 * This module is a standalone helper — it formats structured test results
 * into the canonical round artifact `.mdx` format that the Principal reviews.
 */

export interface Issue {
  number: number;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  severity: 'Blocker' | 'Should-fix' | 'Minor';
  classification:
    | 'In-scope defect'
    | 'Regression'
    | 'Out-of-scope bug'
    | 'Out-of-scope enhancement';
  classificationJustification: string;
  principalObservations: string;
  evidence: string;
}

export interface RoundArtifactInput {
  round: number;
  date: string;
  sprintType: 'feat' | 'fix';
  featureName: string;
  branch: string;
  runtime: string;
  subPhasesMerged: string[];
  issues: Issue[];
  priorVerifications: string[];
}

/**
 * Derives result and counts from the issues list.
 */
function deriveDisposition(issues: Issue[]) {
  const inScope = issues.filter(
    (i) => i.classification === 'In-scope defect' || i.classification === 'Regression',
  );
  const outOfScope = issues.filter(
    (i) => i.classification === 'Out-of-scope bug' || i.classification === 'Out-of-scope enhancement',
  );
  return {
    result: inScope.length > 0 ? ('issues_found' as const) : ('passed' as const),
    inScopeCount: inScope.length,
    outOfScopeCount: outOfScope.length,
    inScopeIssues: inScope,
    outOfScopeIssues: outOfScope,
  };
}

function formatIssue(issue: Issue): string {
  return `### Issue ${issue.number}: ${issue.title}

- **Steps:** ${issue.steps}
- **Expected:** ${issue.expected}
- **Actual:** ${issue.actual}
- **Severity:** ${issue.severity}
- **Classification:** ${issue.classification}
- **Classification justification:** ${issue.classificationJustification}
- **Principal observations:** ${issue.principalObservations}
- **Evidence:** ${issue.evidence}`;
}

/**
 * Generate a BT round artifact in `.mdx` format matching the SOP template.
 *
 * The output is a complete, self-contained document ready for Principal review.
 */
export function generateRoundArtifact(input: RoundArtifactInput): string {
  const { result, inScopeCount, outOfScopeCount, inScopeIssues, outOfScopeIssues } =
    deriveDisposition(input.issues);

  const issuesSection =
    input.issues.length > 0
      ? input.issues.map(formatIssue).join('\n\n')
      : 'No issues found. All tested flows passed.';

  const inScopeList =
    inScopeIssues.length > 0
      ? inScopeIssues.map((i) => `  - Issue ${i.number}: ${i.title}`).join('\n')
      : '  None';

  const outOfScopeList =
    outOfScopeIssues.length > 0
      ? outOfScopeIssues.map((i) => `  - Issue ${i.number}: ${i.title}`).join('\n')
      : '  None';

  const priorVerificationsSection =
    input.priorVerifications.length > 0
      ? input.priorVerifications.map((v) => `- ${v}`).join('\n')
      : '- No prior sub-phases to verify';

  const nextAction =
    result === 'issues_found'
      ? 'Route in-scope issues to fix sub-phase discovery'
      : 'Proceed to User Documentation';

  return `---
title: "Behavioral Testing — Round ${input.round}"
date: ${input.date}
sprint: ${input.sprintType}/${input.featureName}
branch: ${input.branch}
round: ${input.round}
result: ${result}
in_scope_count: ${inScopeCount}
out_of_scope_count: ${outOfScopeCount}
---

# Behavioral Testing — Round ${input.round}

## Test Environment

- Branch: \`${input.branch}\`
- Runtime: ${input.runtime}
- Sub-phases merged: ${input.subPhasesMerged.join(', ')}

## Results

${issuesSection}

### Verification of prior sub-phase fixes

${priorVerificationsSection}

## Disposition

- **Result:** \`${result}\`
- **In-scope blockers:** ${inScopeCount}
${inScopeList}
- **Out-of-scope observations:** ${outOfScopeCount}
${outOfScopeList}
- **Next action:** ${nextAction}
`;
}
