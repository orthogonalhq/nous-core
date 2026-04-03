/**
 * @nous/subcortex-cost — Cost governance domain.
 *
 * Sub-phase 1.1: Pricing table public API.
 * Sub-phase 1.2: CostGovernanceService and enforcement.
 */
export {
  createPricingTable,
  lookupPricingTier,
  computeCost,
} from './pricing-table.js';

export { CostGovernanceService, computePeriodBounds } from './cost-governance-service.js';
export type { CostGovernanceServiceDeps, ProjectConfig } from './cost-governance-service.js';
export { CostEnforcement } from './cost-enforcement.js';
export type { CostEnforcementDeps, IOpctlServiceForEnforcement, EnforcementRecord } from './cost-enforcement.js';
