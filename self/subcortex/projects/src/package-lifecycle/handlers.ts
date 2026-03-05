import type {
  PackageLifecycleReasonCode,
  PackageLifecycleSourceState,
  PackageLifecycleState,
  PackageLifecycleTransitionRequest,
} from '@nous/shared';

export interface TransitionHandlerOutcome {
  decision: 'allowed' | 'blocked' | 'disabled';
  toState: PackageLifecycleState;
  reasonCode?: PackageLifecycleReasonCode;
}

export const resolveBlockedState = (
  fromState: PackageLifecycleSourceState,
  reasonCode: PackageLifecycleReasonCode,
): PackageLifecycleState => {
  if (reasonCode.startsWith('PKG-001')) {
    return 'quarantined';
  }
  if (reasonCode === 'PKG-004-ROLLBACK_TRUST_CHECK_FAILED') {
    return 'disabled';
  }
  if (fromState === 'none') {
    return 'quarantined';
  }
  return fromState;
};

export const resolveTrustScope = (
  request: PackageLifecycleTransitionRequest,
  toState: PackageLifecycleState,
): 'local_instance' | 'cross_instance_approved' | 'quarantined' => {
  if (toState === 'quarantined') {
    return 'quarantined';
  }

  if (
    request.origin_class === 'self_created_local' &&
    request.admission?.is_imported
  ) {
    if (
      request.admission.reverification_complete &&
      request.admission.reapproval_complete
    ) {
      return 'cross_instance_approved';
    }
  }

  return 'local_instance';
};

export const handleSimpleAllowedTransition = (
  toState: PackageLifecycleState,
): TransitionHandlerOutcome => ({
  decision: 'allowed',
  toState,
});
