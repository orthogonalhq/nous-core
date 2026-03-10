import { randomUUID } from 'node:crypto';
import type {
  ArtifactDeleteRequest,
  ArtifactListFilter,
  ArtifactReadRequest,
  ArtifactReadResult,
  ArtifactVersionRecord,
  ArtifactWriteRequest,
  ArtifactWriteResult,
  IArtifactStore,
  IDocumentStore,
} from '@nous/shared';
import {
  ArtifactDeleteRequestSchema,
  ArtifactListFilterSchema,
  ArtifactReadRequestSchema,
  ArtifactVersionRecordSchema,
  ArtifactWriteRequestSchema,
} from '@nous/shared';
import {
  buildArtifactRef,
  computeIntegrityRef,
  decodeArtifactData,
  encodeArtifactData,
} from './integrity.js';

export const ARTIFACT_MANIFEST_COLLECTION = 'artifact_manifests';
export const ARTIFACT_PAYLOAD_COLLECTION = 'artifact_payloads';

interface ArtifactPayloadDocument {
  id: string;
  artifactId: string;
  projectId: string;
  version: number;
  contentEncoding: ArtifactWriteRequest['contentEncoding'];
  dataBase64: string;
}

export interface DocumentArtifactStoreOptions {
  now?: () => Date;
  autoCommit?: boolean;
}

function parseManifest(value: unknown): ArtifactVersionRecord | null {
  const parsed = ArtifactVersionRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function manifestDocumentId(artifactId: string, version: number): string {
  return `${artifactId}:v${version}`;
}

function matchesFilters(
  record: ArtifactVersionRecord,
  filters: ArtifactListFilter,
): boolean {
  if (filters.mimeType && record.mimeType !== filters.mimeType) {
    return false;
  }
  if (filters.tags && !filters.tags.every((tag) => record.tags.includes(tag))) {
    return false;
  }
  if (filters.fromDate && record.createdAt < filters.fromDate) {
    return false;
  }
  if (filters.toDate && record.createdAt > filters.toDate) {
    return false;
  }
  if (filters.workflowRunId && record.lineage?.workflowRunId !== filters.workflowRunId) {
    return false;
  }
  if (
    filters.workflowNodeDefinitionId &&
    record.lineage?.workflowNodeDefinitionId !== filters.workflowNodeDefinitionId
  ) {
    return false;
  }
  if (filters.checkpointId && record.lineage?.checkpointId !== filters.checkpointId) {
    return false;
  }
  return true;
}

export class DocumentArtifactStore implements IArtifactStore {
  private readonly now: () => Date;
  private readonly autoCommit: boolean;

  constructor(
    private readonly documentStore: IDocumentStore,
    options: DocumentArtifactStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.autoCommit = options.autoCommit ?? true;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private async listAllManifests(): Promise<ArtifactVersionRecord[]> {
    const raw = await this.documentStore.query<unknown>(ARTIFACT_MANIFEST_COLLECTION, {});
    return raw
      .map(parseManifest)
      .filter((record): record is ArtifactVersionRecord => record !== null);
  }

  private async listVersions(
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactVersionRecord[]> {
    const manifests = await this.listAllManifests();
    return manifests
      .filter(
        (record) => record.projectId === projectId && record.artifactId === artifactId,
      )
      .sort((left, right) => left.version - right.version);
  }

  private async loadPayload(
    artifactId: string,
    version: number,
  ): Promise<ArtifactPayloadDocument | null> {
    return this.documentStore.get<ArtifactPayloadDocument>(
      ARTIFACT_PAYLOAD_COLLECTION,
      manifestDocumentId(artifactId, version),
    );
  }

  async store(request: ArtifactWriteRequest): Promise<ArtifactWriteResult> {
    const parsed = ArtifactWriteRequestSchema.parse(request);
    const artifactId = parsed.artifactId ?? (randomUUID() as any);
    const existing = await this.listVersions(parsed.projectId, artifactId);
    const version = existing.length === 0
      ? 1
      : Math.max(...existing.map((record) => record.version)) + 1;
    const timestamp = this.nowIso();
    const integrityRef = computeIntegrityRef(parsed.data, parsed.contentEncoding);
    const encoded = encodeArtifactData(parsed.data, parsed.contentEncoding);
    const artifactRef = buildArtifactRef(artifactId as any, version);
    const documentId = manifestDocumentId(artifactId, version);

    const prepared = ArtifactVersionRecordSchema.parse({
      artifactId,
      version,
      artifactRef,
      projectId: parsed.projectId,
      name: parsed.name,
      mimeType: parsed.mimeType,
      sizeBytes: encoded.bytes.byteLength,
      integrityRef,
      writeState: 'prepared',
      lineage: parsed.lineage,
      tags: parsed.tags,
      createdAt: timestamp,
      committedAt: null,
      updatedAt: timestamp,
    });

    await this.documentStore.put(ARTIFACT_MANIFEST_COLLECTION, documentId, prepared);
    await this.documentStore.put<ArtifactPayloadDocument>(
      ARTIFACT_PAYLOAD_COLLECTION,
      documentId,
      {
        id: documentId,
        artifactId,
        projectId: parsed.projectId,
        version,
        contentEncoding: parsed.contentEncoding,
        dataBase64: encoded.storedBase64,
      },
    );

    if (!this.autoCommit) {
      return {
        artifactId,
        version,
        artifactRef,
        integrityRef,
        committed: false,
      };
    }

    const committed = await this.commitPreparedVersion({
      projectId: parsed.projectId,
      artifactId,
      version,
    });
    return committed ?? {
      artifactId,
      version,
      artifactRef,
      integrityRef,
      committed: false,
    };
  }

  async commitPreparedVersion(
    request: ArtifactReadRequest,
  ): Promise<ArtifactWriteResult | null> {
    return this.commitPreparedVersionInternal(request);
  }

  private async commitPreparedVersionInternal(
    request: ArtifactReadRequest,
  ): Promise<ArtifactWriteResult | null> {
    const parsed = ArtifactReadRequestSchema.parse(request);
    if (parsed.version == null) {
      throw new Error('commitPreparedVersion requires an explicit version');
    }

    const documentId = manifestDocumentId(parsed.artifactId, parsed.version);
    const manifest = parseManifest(
      await this.documentStore.get<unknown>(ARTIFACT_MANIFEST_COLLECTION, documentId),
    );
    if (!manifest || manifest.projectId !== parsed.projectId) {
      return null;
    }

    const payload = await this.loadPayload(parsed.artifactId, parsed.version);
    if (!payload) {
      return null;
    }

    const decoded = decodeArtifactData(payload.dataBase64, payload.contentEncoding);
    const integrityRef = computeIntegrityRef(decoded, payload.contentEncoding);
    if (integrityRef !== manifest.integrityRef) {
      return null;
    }

    const committedAt = this.nowIso();
    const committed = ArtifactVersionRecordSchema.parse({
      ...manifest,
      writeState: 'committed',
      committedAt,
      updatedAt: committedAt,
    });
    await this.documentStore.put(ARTIFACT_MANIFEST_COLLECTION, documentId, committed);

    return {
      artifactId: committed.artifactId,
      version: committed.version,
      artifactRef: committed.artifactRef,
      integrityRef: committed.integrityRef,
      committed: true,
    };
  }

  async retrieve(request: ArtifactReadRequest): Promise<ArtifactReadResult | null> {
    const parsed = ArtifactReadRequestSchema.parse(request);
    const versions = await this.listVersions(parsed.projectId, parsed.artifactId);
    const selected = parsed.version != null
      ? versions.find((record) => record.version === parsed.version)
      : [...versions]
        .reverse()
        .find((record) => record.writeState === 'committed');

    if (!selected || selected.writeState !== 'committed') {
      return null;
    }

    const payload = await this.loadPayload(selected.artifactId, selected.version);
    if (!payload || payload.projectId !== parsed.projectId) {
      return null;
    }

    const data = decodeArtifactData(payload.dataBase64, payload.contentEncoding);
    const integrityRef = computeIntegrityRef(data, payload.contentEncoding);
    if (integrityRef !== selected.integrityRef) {
      return null;
    }

    return {
      ...selected,
      data: typeof data === 'string' ? data : new Uint8Array(data),
      contentEncoding: payload.contentEncoding,
    };
  }

  async list(
    projectId: ArtifactReadRequest['projectId'],
    filters?: ArtifactListFilter,
  ): Promise<ArtifactVersionRecord[]> {
    const parsedFilters = ArtifactListFilterSchema.parse(filters ?? {});
    const manifests = (await this.listAllManifests())
      .filter((record) => record.projectId === projectId)
      .filter((record) => matchesFilters(record, parsedFilters))
      .sort((left, right) => {
        if (left.artifactId === right.artifactId) {
          return right.version - left.version;
        }
        return left.artifactId.localeCompare(right.artifactId);
      });

    const visible = parsedFilters.includeAllVersions
      ? manifests
      : Object.values(
          manifests
            .filter((record) => record.writeState === 'committed')
            .reduce<Record<string, ArtifactVersionRecord>>((accumulator, record) => {
              const existing = accumulator[record.artifactId];
              if (!existing || record.version > existing.version) {
                accumulator[record.artifactId] = record;
              }
              return accumulator;
            }, {}),
        );

    const offset = parsedFilters.offset ?? 0;
    const limit = parsedFilters.limit ?? visible.length;
    return visible.slice(offset, offset + limit);
  }

  async delete(request: ArtifactDeleteRequest): Promise<boolean> {
    const parsed = ArtifactDeleteRequestSchema.parse(request);
    const manifests = await this.listVersions(parsed.projectId, parsed.artifactId);
    const targets = parsed.version == null
      ? manifests
      : manifests.filter((record) => record.version === parsed.version);

    if (targets.length === 0) {
      return false;
    }

    let deleted = false;
    for (const target of targets) {
      const documentId = manifestDocumentId(target.artifactId, target.version);
      const removedManifest = await this.documentStore.delete(
        ARTIFACT_MANIFEST_COLLECTION,
        documentId,
      );
      const removedPayload = await this.documentStore.delete(
        ARTIFACT_PAYLOAD_COLLECTION,
        documentId,
      );
      deleted = deleted || removedManifest || removedPayload;
    }

    return deleted;
  }
}
