import type {
  PackageLifecycleSourceState,
  PackageLifecycleState,
  PackageLifecycleTransition,
} from '@nous/shared';

export const NO_STATE_ALLOWED_TRANSITIONS: readonly PackageLifecycleTransition[] =
  ['ingest', 'import'];

export const ALLOWED_TRANSITIONS_BY_STATE: Record<
  PackageLifecycleState,
  readonly PackageLifecycleTransition[]
> = {
  ingested: ['install', 'disable'],
  installed: ['enable', 'remove', 'disable'],
  enabled: ['run', 'stage_update', 'export', 'remove', 'disable'],
  running: ['stage_update', 'export', 'remove', 'disable'],
  update_staged: ['commit_update', 'rollback_update', 'disable'],
  update_committed: ['run', 'stage_update', 'export', 'remove', 'disable'],
  rolled_back: ['enable', 'run', 'stage_update', 'export', 'remove', 'disable'],
  quarantined: ['disable'],
  import_verified: ['install', 'enable', 'disable'],
  removed: [],
  disabled: ['enable', 'remove'],
};

export const isTransitionAllowed = (
  fromState: PackageLifecycleSourceState,
  transition: PackageLifecycleTransition,
): boolean => {
  if (fromState === 'none') {
    return NO_STATE_ALLOWED_TRANSITIONS.includes(transition);
  }
  return ALLOWED_TRANSITIONS_BY_STATE[fromState].includes(transition);
};

export const resolveTransitionTargetState = (
  transition: PackageLifecycleTransition,
  fromState: PackageLifecycleSourceState,
): PackageLifecycleState => {
  switch (transition) {
    case 'ingest':
      return 'ingested';
    case 'install':
      return 'installed';
    case 'enable':
      return 'enabled';
    case 'run':
      return 'running';
    case 'stage_update':
      return 'update_staged';
    case 'commit_update':
      return 'update_committed';
    case 'rollback_update':
      return 'rolled_back';
    case 'import':
      return 'import_verified';
    case 'remove':
      return 'removed';
    case 'disable':
      return 'disabled';
    case 'export':
      if (fromState === 'none') {
        return 'ingested';
      }
      return fromState;
    default: {
      const exhaustiveCheck: never = transition;
      throw new Error(`Unhandled transition: ${exhaustiveCheck}`);
    }
  }
};
