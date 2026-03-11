import type {
  IDocumentStore,
  MaintainerIdentity,
  RegistryAppealRecord,
  RegistryGovernanceAction,
  RegistryPackage,
  RegistryRelease,
} from '@nous/shared';
import {
  MaintainerIdentitySchema,
  RegistryAppealRecordSchema,
  RegistryGovernanceActionSchema,
  RegistryPackageSchema,
  RegistryReleaseSchema,
} from '@nous/shared';

export const REGISTRY_PACKAGE_COLLECTION = 'registry_packages';
export const REGISTRY_RELEASE_COLLECTION = 'registry_releases';
export const REGISTRY_MAINTAINER_COLLECTION = 'registry_maintainers';
export const REGISTRY_GOVERNANCE_COLLECTION = 'registry_governance_actions';
export const REGISTRY_APPEAL_COLLECTION = 'registry_appeals';

function parsePackage(value: unknown): RegistryPackage | null {
  const parsed = RegistryPackageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseRelease(value: unknown): RegistryRelease | null {
  const parsed = RegistryReleaseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseMaintainer(value: unknown): MaintainerIdentity | null {
  const parsed = MaintainerIdentitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseAppeal(value: unknown): RegistryAppealRecord | null {
  const parsed = RegistryAppealRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseGovernanceAction(value: unknown): RegistryGovernanceAction | null {
  const parsed = RegistryGovernanceActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentRegistryStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async savePackage(record: RegistryPackage): Promise<RegistryPackage> {
    const validated = RegistryPackageSchema.parse(record);
    await this.documentStore.put(
      REGISTRY_PACKAGE_COLLECTION,
      validated.package_id,
      validated,
    );
    return validated;
  }

  async getPackage(packageId: string): Promise<RegistryPackage | null> {
    const raw = await this.documentStore.get<unknown>(
      REGISTRY_PACKAGE_COLLECTION,
      packageId,
    );
    return parsePackage(raw);
  }

  async listPackages(): Promise<RegistryPackage[]> {
    const raw = await this.documentStore.query<unknown>(REGISTRY_PACKAGE_COLLECTION, {
      orderBy: 'updated_at',
      orderDirection: 'desc',
    });

    return raw
      .map(parsePackage)
      .filter((record): record is RegistryPackage => record !== null);
  }

  async saveRelease(record: RegistryRelease): Promise<RegistryRelease> {
    const validated = RegistryReleaseSchema.parse(record);
    await this.documentStore.put(
      REGISTRY_RELEASE_COLLECTION,
      validated.release_id,
      validated,
    );
    return validated;
  }

  async getRelease(releaseId: string): Promise<RegistryRelease | null> {
    const raw = await this.documentStore.get<unknown>(
      REGISTRY_RELEASE_COLLECTION,
      releaseId,
    );
    return parseRelease(raw);
  }

  async listReleasesByPackage(packageId: string): Promise<RegistryRelease[]> {
    const raw = await this.documentStore.query<unknown>(REGISTRY_RELEASE_COLLECTION, {
      where: { package_id: packageId },
      orderBy: 'published_at',
      orderDirection: 'desc',
    });

    return raw
      .map(parseRelease)
      .filter((record): record is RegistryRelease => record !== null);
  }

  async saveMaintainer(record: MaintainerIdentity): Promise<MaintainerIdentity> {
    const validated = MaintainerIdentitySchema.parse(record);
    await this.documentStore.put(
      REGISTRY_MAINTAINER_COLLECTION,
      validated.maintainer_id,
      validated,
    );
    return validated;
  }

  async getMaintainer(maintainerId: string): Promise<MaintainerIdentity | null> {
    const raw = await this.documentStore.get<unknown>(
      REGISTRY_MAINTAINER_COLLECTION,
      maintainerId,
    );
    return parseMaintainer(raw);
  }

  async listMaintainersByIds(
    maintainerIds: readonly string[],
  ): Promise<MaintainerIdentity[]> {
    const maintainers = await Promise.all(
      maintainerIds.map((maintainerId) => this.getMaintainer(maintainerId)),
    );
    return maintainers.filter(
      (maintainer): maintainer is MaintainerIdentity => maintainer !== null,
    );
  }

  async saveGovernanceAction(
    record: RegistryGovernanceAction,
  ): Promise<RegistryGovernanceAction> {
    const validated = RegistryGovernanceActionSchema.parse(record);
    await this.documentStore.put(
      REGISTRY_GOVERNANCE_COLLECTION,
      validated.action_id,
      validated,
    );
    return validated;
  }

  async listGovernanceActions(): Promise<RegistryGovernanceAction[]> {
    const raw = await this.documentStore.query<unknown>(REGISTRY_GOVERNANCE_COLLECTION, {
      orderBy: 'created_at',
      orderDirection: 'desc',
    });

    return raw
      .map(parseGovernanceAction)
      .filter(
        (record): record is RegistryGovernanceAction => record !== null,
      );
  }

  async saveAppeal(record: RegistryAppealRecord): Promise<RegistryAppealRecord> {
    const validated = RegistryAppealRecordSchema.parse(record);
    await this.documentStore.put(
      REGISTRY_APPEAL_COLLECTION,
      validated.appeal_id,
      validated,
    );
    return validated;
  }

  async getAppeal(appealId: string): Promise<RegistryAppealRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      REGISTRY_APPEAL_COLLECTION,
      appealId,
    );
    return parseAppeal(raw);
  }

  async listAppeals(): Promise<RegistryAppealRecord[]> {
    const raw = await this.documentStore.query<unknown>(REGISTRY_APPEAL_COLLECTION, {
      orderBy: 'updated_at',
      orderDirection: 'desc',
    });

    return raw
      .map(parseAppeal)
      .filter((record): record is RegistryAppealRecord => record !== null);
  }
}
