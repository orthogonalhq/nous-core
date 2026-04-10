/**
 * U2 system config migration — pre-safeParse preprocessing for
 * ModelRoleAssignment arrays containing legacy 7-role taxonomy literals.
 *
 * Called from loader.ts before SystemConfigSchema.safeParse.
 */
import { migrateLegacyModelRole } from '@nous/shared';

/**
 * Migrate legacy model-role assignments in a raw system config blob.
 *
 * Rewrites `modelRoleAssignments[].role` values using the shared
 * migration helper, silently dropping entries whose role maps to `null`
 * (i.e., the 5 removed capability roles).
 */
export function migrateSystemConfigModelRoleAssignments(input: unknown): unknown {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }

  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.modelRoleAssignments)) {
    return input;
  }

  const migrated: unknown[] = [];
  for (const entry of obj.modelRoleAssignments) {
    if (entry === null || entry === undefined || typeof entry !== 'object') {
      migrated.push(entry);
      continue;
    }

    const e = entry as Record<string, unknown>;
    if (typeof e.role !== 'string') {
      migrated.push(entry);
      continue;
    }

    const newRole = migrateLegacyModelRole(e.role);
    if (newRole === null) continue; // silently drop
    migrated.push({ ...e, role: newRole });
  }

  return { ...obj, modelRoleAssignments: migrated };
}
