// Offline only: checks the actual demand/supply solver, never classroom data.
import assert from 'node:assert/strict';
process.env.BALANCE_IMPORT_ONLY = '1';
await import('./review-ten-rounds.mjs');
const { MARKETS, DEMAND_EVENT_OPTIONS } = await import('../src/types/domain.ts');
const { transitionMarkets, normalizeRoom } = await import('../src/services/roomService.ts');
const { calculateCompetitiveMarket: clear } = await import('../src/services/productionService.ts');
const { getEventMarketMultipliers } = await import('../src/services/eventStrength.ts');
const intensities = ['WEAK', 'MEDIUM', 'STRONG'];
const make = (m, d = 'baseline', s = 'supply_baseline', di = 'MEDIUM', si = 'MEDIUM') => ({
  marketId: m.id, marketEffectVersion: 2, effectType: 'DEMAND', optionId: d, supplyOptionId: s,
  multiplier: DEMAND_EVENT_OPTIONS.find(o => o.id === d).multiplier,
  supplyCurveMultiplier: DEMAND_EVENT_OPTIONS.find(o => o.id === s).supplyMultiplier ?? 1,
  demandIntensity: di, supplyIntensity: si, producerTaxPerUnit: s === 'producer_tax' ? 100 : 0,
  producerSubsidyPerUnit: s === 'producer_subsidy' ? 100 : 0,
});
let checked = 0;
for (const m of MARKETS.filter(m => m.marketType === 'PERFECT_COMPETITION')) {
  const run = (base, e, previous = []) => transitionMarkets({ markets: [base], demandEvents: previous }, [e])[0];
  // Also test an already shifted market and a legacy market with an existing tax.
  for (const base of [m, run(m, make(m, 'consumers_up')), { ...m, producerTaxPerUnit: 80 }]) {
    const before = clear(base, 0);
    for (const d of DEMAND_EVENT_OPTIONS.filter(o => o.effectType !== 'SUPPLY')) {
      for (const s of DEMAND_EVENT_OPTIONS.filter(o => o.effectType === 'SUPPLY')) {
        for (const di of intensities) for (const si of intensities) {
          const e = make(m, d.id, s.id, di, si);
          const factors = getEventMarketMultipliers(e, base);
          const after = clear(run(base, e), 0);
          const label = `${m.id} ${d.id}/${di} ${s.id}/${si}`;
          if (Math.abs(factors.demand - factors.supply) < 1e-9) {
            assert.equal(after.marketPrice, before.marketPrice, label);
            assert.ok(Math.abs(after.unroundedMarketPrice - before.unroundedMarketPrice) < 0.1, label);
          } else {
            assert.equal(Math.sign(after.unroundedMarketPrice - before.unroundedMarketPrice), Math.sign(factors.demand - factors.supply), label);
          }
          if (factors.demand > 1 && factors.supply > 1) assert.ok(after.demandQuantity > before.demandQuantity, label);
          if (factors.demand < 1 && factors.supply < 1) assert.ok(after.demandQuantity < before.demandQuantity, label);
          checked++;
        }
      }
    }
    const noSupply = clear(run(base, make(m, 'consumers_up')), 0).marketPrice;
    const strongSupply = clear(run(base, make(m, 'consumers_up', 'suppliers_up', 'MEDIUM', 'STRONG')), 0).marketPrice;
    const opposed = clear(run(base, make(m, 'consumers_up', 'suppliers_down')), 0).marketPrice;
    assert.ok(opposed > noSupply && noSupply > strongSupply);
    for (const version of [1, 2]) {
      const shock = { ...make(m, 'income_up', 'producer_expect_up', 'STRONG', 'WEAK'), marketEffectVersion: version };
      const affected = run(base, shock);
      const normalized = normalizeRoom('offline', { markets: [affected], demandEvents: [shock] });
      assert.equal(normalized.demandEvents.find(e => e.marketId === m.id).marketEffectVersion, version);
      const recovered = run(normalized.markets.find(x => x.id === m.id), make(m), normalized.demandEvents);
      assert.equal(clear(recovered, 0).marketPrice, before.marketPrice);
    }
  }
  console.log(`${m.name}: direction, cancellation, quantity, ordering, legacy/new recovery PASS`);
}
console.log(`PASS: ${checked} market/event/intensity combinations.`);
