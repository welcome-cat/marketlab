import type { DemandEvent, Market } from '../types/domain';
import { DEMAND_EVENT_OPTIONS, EVENT_INTENSITY_SCALE } from '../types/domain';

export const MARKET_EVENT_BASE_CHANGE = 0.1;

/** Equal horizontal proportional shifts cancel price effects, not quantity effects. */
export const getEventMarketMultipliers = (event: DemandEvent, market: Market) => {
  const demandScale = event.demandIntensity ? EVENT_INTENSITY_SCALE[event.demandIntensity] : market.demandEventEffectScale;
  const supplyScale = event.supplyIntensity ? EVENT_INTENSITY_SCALE[event.supplyIntensity] : market.supplyEventEffectScale;
  const legacySupply = event.effectType === 'SUPPLY';
  const rawSupply = legacySupply ? event.supplyMultiplier : event.supplyCurveMultiplier ?? event.supplyMultiplier;
  if (event.marketEffectVersion !== 2) return {
    demand: 1 + ((event.multiplier ?? 1) - 1) * demandScale,
    supply: 1 + ((rawSupply ?? 1) - 1) * supplyScale,
  };
  const demandOption = DEMAND_EVENT_OPTIONS.find(option => option.id === event.optionId);
  const supplyOption = DEMAND_EVENT_OPTIONS.find(option => option.id === (legacySupply ? event.optionId : event.supplyOptionId));
  const demandDirection = legacySupply ? 0 : Math.sign((demandOption?.multiplier ?? event.multiplier ?? 1) - 1);
  const supplyDirection = Math.sign((supplyOption?.supplyMultiplier ?? rawSupply ?? 1) - 1);
  return {
    demand: 1 + demandDirection * MARKET_EVENT_BASE_CHANGE * demandScale,
    supply: 1 + supplyDirection * MARKET_EVENT_BASE_CHANGE * supplyScale,
  };
};
