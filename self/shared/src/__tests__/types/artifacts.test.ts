import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_INTEGRITY_REF_REGEX,
  ArtifactDeleteRequestSchema,
  ArtifactListFilterSchema,
  ArtifactReadRequestSchema,
  ArtifactReadResultSchema,
  ArtifactVersionRecordSchema,
  ArtifactWriteRequestSchema,
  ArtifactWriteResultSchema,
} from '../../types/artifacts.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440120';
const ARTIFACT_ID = '550e8400-e29b-41d4-a716-446655440121';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440122';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440123';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440124';
const NOW = '2026-03-08T00:00:00.000Z';
const INTEGRITY_REF = `sha256:${'a'.repeat(64)}`;

describe('ArtifactWriteRequestSchema', () => {
  it('accepts a versioned artifact write request with lineage', () => {
    const result = ArtifactWriteRequestSchema.safeParse({
      projectId: PROJECT_ID,
      artifactId: ARTIFACT_ID,
      name: 'report.txt',
      mimeType: 'text/plain',
      data: 'hello world',
      contentEncoding: 'utf8',
      tags: ['daily'],
      lineage: {
        workflowRunId: RUN_ID,
        workflowNodeDefinitionId: NODE_ID,
        dispatchLineageId: LINEAGE_ID,
        evidenceRefs: ['evidence://artifact/store'],
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('ArtifactVersionRecordSchema', () => {
  const record = {
    artifactId: ARTIFACT_ID,
    version: 2,
    artifactRef: `artifact://${ARTIFACT_ID}/v2`,
    projectId: PROJECT_ID,
    name: 'report.txt',
    mimeType: 'text/plain',
    sizeBytes: 11,
    integrityRef: INTEGRITY_REF,
    writeState: 'committed' as const,
    lineage: {
      workflowRunId: RUN_ID,
      evidenceRefs: ['evidence://artifact/store'],
    },
    tags: ['daily'],
    createdAt: NOW,
    committedAt: NOW,
    updatedAt: NOW,
  };

  it('accepts committed and prepared version records', () => {
    expect(ArtifactVersionRecordSchema.safeParse(record).success).toBe(true);
    expect(
      ArtifactVersionRecordSchema.safeParse({
        ...record,
        version: 3,
        artifactRef: `artifact://${ARTIFACT_ID}/v3`,
        writeState: 'prepared',
        committedAt: null,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid integrity refs', () => {
    expect(
      ArtifactVersionRecordSchema.safeParse({
        ...record,
        integrityRef: 'sha256:bad',
      }).success,
    ).toBe(false);
  });
});

describe('Artifact request/result schemas', () => {
  it('accepts read/delete/list requests and write results', () => {
    expect(
      ArtifactReadRequestSchema.safeParse({
        projectId: PROJECT_ID,
        artifactId: ARTIFACT_ID,
        version: 2,
      }).success,
    ).toBe(true);

    expect(
      ArtifactDeleteRequestSchema.safeParse({
        projectId: PROJECT_ID,
        artifactId: ARTIFACT_ID,
      }).success,
    ).toBe(true);

    expect(
      ArtifactListFilterSchema.safeParse({
        workflowRunId: RUN_ID,
        workflowNodeDefinitionId: NODE_ID,
        includeAllVersions: true,
        limit: 10,
      }).success,
    ).toBe(true);

    expect(
      ArtifactWriteResultSchema.safeParse({
        artifactId: ARTIFACT_ID,
        version: 2,
        artifactRef: `artifact://${ARTIFACT_ID}/v2`,
        integrityRef: INTEGRITY_REF,
        committed: true,
      }).success,
    ).toBe(true);
  });

  it('accepts a read result with payload data', () => {
    expect(
      ArtifactReadResultSchema.safeParse({
        artifactId: ARTIFACT_ID,
        version: 2,
        artifactRef: `artifact://${ARTIFACT_ID}/v2`,
        projectId: PROJECT_ID,
        name: 'report.txt',
        mimeType: 'text/plain',
        sizeBytes: 11,
        integrityRef: INTEGRITY_REF,
        writeState: 'committed',
        tags: ['daily'],
        createdAt: NOW,
        committedAt: NOW,
        updatedAt: NOW,
        data: 'hello world',
        contentEncoding: 'utf8',
      }).success,
    ).toBe(true);
  });
});

describe('ARTIFACT_INTEGRITY_REF_REGEX', () => {
  it('matches canonical sha256 refs', () => {
    expect(ARTIFACT_INTEGRITY_REF_REGEX.test(INTEGRITY_REF)).toBe(true);
    expect(ARTIFACT_INTEGRITY_REF_REGEX.test('sha256:bad')).toBe(false);
  });
});
