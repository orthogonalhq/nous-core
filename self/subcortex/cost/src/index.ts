/**
 * @nous/subcortex-cost — Cost governance domain.
 *
 * Sub-phase 1.1: Pricing table public API.
 * Sub-phase 1.2 will add CostGovernanceService and enforcement exports.
 */
export {
  createPricingTable,
  lookupPricingTier,
  computeCost,
} from './pricing-table.js';
