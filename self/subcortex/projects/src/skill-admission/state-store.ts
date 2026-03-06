import {
  SkillAdmissionDecisionRecordSchema,
  type SkillAdmissionDecisionRecord,
} from '@nous/shared';

export class SkillAdmissionStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillAdmissionStateConflictError';
  }
}

const buildKey = (skillId: string, revisionId: string): string =>
  `${skillId}::${revisionId}`;

const cloneRecord = (
  record: SkillAdmissionDecisionRecord,
): SkillAdmissionDecisionRecord => structuredClone(record);

export class InMemorySkillAdmissionStateStore {
  private readonly records = new Map<string, SkillAdmissionDecisionRecord>();

  async get(
    skillId: string,
    revisionId: string,
  ): Promise<SkillAdmissionDecisionRecord | null> {
    const key = buildKey(skillId, revisionId);
    const existing = this.records.get(key);
    if (!existing) {
      return null;
    }
    return cloneRecord(existing);
  }

  async upsert(
    record: SkillAdmissionDecisionRecord,
    expectedVersion?: number,
  ): Promise<SkillAdmissionDecisionRecord> {
    const key = buildKey(record.skill_id, record.revision_id);
    const existing = this.records.get(key);

    if (
      typeof expectedVersion === 'number' &&
      (!existing || existing.state_version !== expectedVersion)
    ) {
      throw new SkillAdmissionStateConflictError(
        `Skill admission state version conflict for ${record.skill_id}/${record.revision_id}`,
      );
    }

    const validated = SkillAdmissionDecisionRecordSchema.parse(record);
    this.records.set(key, validated);
    return cloneRecord(validated);
  }
}

