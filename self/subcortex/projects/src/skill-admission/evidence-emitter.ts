import {
  SkillAdmissionEventSchema,
  type SkillAdmissionEvent,
} from '@nous/shared';

export interface SkillAdmissionEvidenceEmitter {
  emit(
    event: Omit<SkillAdmissionEvent, 'occurred_at' | 'witness_ref'> & {
      occurred_at?: string;
      witness_ref?: string;
    },
  ): Promise<SkillAdmissionEvent>;
}

const defaultWitnessRef = (): string =>
  `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class InMemorySkillAdmissionEvidenceEmitter
  implements SkillAdmissionEvidenceEmitter
{
  private readonly events: SkillAdmissionEvent[] = [];
  private readonly witnessRefFactory: () => string;
  private readonly now: () => Date;

  constructor(options?: { witnessRefFactory?: () => string; now?: () => Date }) {
    this.witnessRefFactory = options?.witnessRefFactory ?? defaultWitnessRef;
    this.now = options?.now ?? (() => new Date());
  }

  async emit(
    event: Omit<SkillAdmissionEvent, 'occurred_at' | 'witness_ref'> & {
      occurred_at?: string;
      witness_ref?: string;
    },
  ): Promise<SkillAdmissionEvent> {
    const validated = SkillAdmissionEventSchema.parse({
      ...event,
      occurred_at: event.occurred_at ?? this.now().toISOString(),
      witness_ref: event.witness_ref ?? this.witnessRefFactory(),
    });
    this.events.push(validated);
    return structuredClone(validated);
  }

  getEvents(): SkillAdmissionEvent[] {
    return structuredClone(this.events);
  }
}

