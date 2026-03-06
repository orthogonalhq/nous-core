import {
  PackageLifecycleDecisionEventSchema,
  type PackageLifecycleDecisionEvent,
} from '@nous/shared';

export interface PackageLifecycleEvidenceEmitter {
  emit(
    event: Omit<PackageLifecycleDecisionEvent, 'witness_ref'> & {
      witness_ref?: string;
    },
  ): Promise<PackageLifecycleDecisionEvent>;
}

const defaultWitnessRef = (): string =>
  `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class InMemoryPackageLifecycleEvidenceEmitter
  implements PackageLifecycleEvidenceEmitter
{
  private readonly events: PackageLifecycleDecisionEvent[] = [];
  private readonly witnessRefFactory: () => string;

  constructor(options?: { witnessRefFactory?: () => string }) {
    this.witnessRefFactory = options?.witnessRefFactory ?? defaultWitnessRef;
  }

  async emit(
    event: Omit<PackageLifecycleDecisionEvent, 'witness_ref'> & {
      witness_ref?: string;
    },
  ): Promise<PackageLifecycleDecisionEvent> {
    const validated = PackageLifecycleDecisionEventSchema.parse({
      ...event,
      witness_ref: event.witness_ref ?? this.witnessRefFactory(),
    });
    this.events.push(validated);
    return structuredClone(validated);
  }

  getEvents(): PackageLifecycleDecisionEvent[] {
    return structuredClone(this.events);
  }
}
