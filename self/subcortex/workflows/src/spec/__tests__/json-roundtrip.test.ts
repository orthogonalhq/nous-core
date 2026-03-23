import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateWorkflowSpec } from '@nous/shared';
import {
  parseJsonWorkflowSpec,
  parseWorkflowSpec,
  serializeJsonWorkflowSpec,
  serializeWorkflowSpec,
} from '../index.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));

const fixtures = [
  {
    packageId: 'simple-linear',
    pathSegments: ['self', 'shared', 'examples', 'workflows', 'simple-linear', 'workflow.yaml'],
    expectedNodes: 3,
    expectedConnections: 2,
  },
  {
    packageId: 'branching-conditional',
    pathSegments: [
      'self',
      'shared',
      'examples',
      'workflows',
      'branching-conditional',
      'workflow.yaml',
    ],
    expectedNodes: 5,
    expectedConnections: 5,
  },
  {
    packageId: 'parallel-execution',
    pathSegments: [
      'self',
      'shared',
      'examples',
      'workflows',
      'parallel-execution',
      'workflow.yaml',
    ],
    expectedNodes: 6,
    expectedConnections: 7,
  },
  {
    packageId: 'a-soul-is-born',
    pathSegments: ['.workflows', '.system', 'a-soul-is-born', 'workflow.yaml'],
    expectedNodes: 5,
    expectedConnections: 4,
  },
  {
    packageId: 'self-repair-orchestration-sop',
    pathSegments: [
      '.workflows',
      '.system',
      'self-repair-orchestration-sop',
      'workflow.yaml',
    ],
    expectedNodes: 13,
    expectedConnections: 17,
  },
] as const;

async function loadFixtureSpec(pathSegments: readonly string[]) {
  const yaml = await readFile(resolve(repoRoot, ...pathSegments), 'utf8');
  const parsed = parseWorkflowSpec(yaml);
  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    throw new Error(parsed.errors.map((error) => error.message).join('; '));
  }
  return parsed.data;
}

describe('workflow spec round-trips from repository fixtures', () => {
  it.each(fixtures)(
    '$packageId round-trips through YAML and JSON serialization',
    async ({ pathSegments, expectedNodes, expectedConnections }) => {
      const spec = await loadFixtureSpec(pathSegments);

      expect(spec.nodes).toHaveLength(expectedNodes);
      expect(spec.connections).toHaveLength(expectedConnections);

      const deepValidation = validateWorkflowSpec(spec, { deep: true });
      expect(deepValidation.success).toBe(true);

      const yamlRoundTrip = parseWorkflowSpec(serializeWorkflowSpec(spec));
      expect(yamlRoundTrip.success).toBe(true);
      if (yamlRoundTrip.success) {
        expect(yamlRoundTrip.data).toEqual(spec);
      }

      const jsonRoundTrip = parseJsonWorkflowSpec(
        serializeJsonWorkflowSpec(spec, 2),
      );
      expect(jsonRoundTrip.success).toBe(true);
      if (jsonRoundTrip.success) {
        expect(jsonRoundTrip.data).toEqual(spec);
      }
    },
  );

  it('preserves boolean and named branch outputs across JSON round-trips', async () => {
    const branchingSpec = await loadFixtureSpec([
      'self',
      'shared',
      'examples',
      'workflows',
      'branching-conditional',
      'workflow.yaml',
    ]);
    const selfRepairSpec = await loadFixtureSpec([
      '.workflows',
      '.system',
      'self-repair-orchestration-sop',
      'workflow.yaml',
    ]);

    const branchingJsonRoundTrip = parseJsonWorkflowSpec(
      serializeJsonWorkflowSpec(branchingSpec, 2),
    );
    const selfRepairJsonRoundTrip = parseJsonWorkflowSpec(
      serializeJsonWorkflowSpec(selfRepairSpec, 2),
    );

    expect(branchingJsonRoundTrip.success).toBe(true);
    expect(selfRepairJsonRoundTrip.success).toBe(true);

    if (branchingJsonRoundTrip.success) {
      const outputs = branchingJsonRoundTrip.data.connections
        .map((connection) => connection.output)
        .filter((output) => output !== undefined)
        .sort();
      expect(outputs).toEqual([false, true]);
    }

    if (selfRepairJsonRoundTrip.success) {
      const outputs = selfRepairJsonRoundTrip.data.connections
        .map((connection) => connection.output)
        .filter((output) => output !== undefined)
        .map((output) => String(output))
        .sort();
      expect(outputs).toEqual([
        'approved',
        'approved-repair-execution',
        'clean-fast-close',
        'conditional',
        'direct',
        'dispatch-team',
        'rejected',
        'requires-fail-context',
      ]);
    }
  });
});
