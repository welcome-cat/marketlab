// Runs the application's actual cost/clearing functions without connecting to Firebase.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/firebase/config.ts')) return { format: 'module', source: 'export const db = {};', shortCircuit: true };
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { MARKETS, EMPTY_UPGRADES } = await import('../src/types/domain.ts');
const { calculateProductionQuote: quote, calculateMarketClearing: clearing } = await import('../src/services/productionService.ts');
const simulate = (base, cycle, land, priceFactor = 1, buys = true) => {
  const market = { ...base, productionCycleRounds: cycle, landCapacityPerCycle: land, announcedPrice: Math.round(base.basePrice * priceFactor), basePrice: Math.round(base.basePrice * priceFactor) };
  const company = { cash: 300000, employeeCount: 1, lastHiringRound: 0, machineCount: 1, machineAssets: [], upgrades: { ...EMPTY_UPGRADES }, technologyLevel: 0, industryTraitId: base.id === 'market_toy' ? 'industry_agriculture' : base.id === 'market_tumbler' ? 'industry_service' : 'industry_fashion', productionProfile: { firstWorkerProductivity: 55, productivityDecline: 4, technologyBoostRate: 0, researchBaseCost: 2500 } };
  let inventory = 0, profit = 0;
  const rounds = [];
  for (let round = 1; round <= 12; round++) {
    let best;
    for (let buy = 0; buy <= (buys && round >= 2 ? 2 : 0); buy++) {
      if (company.machineCount + buy > market.maxMachines) continue;
      for (let workers = 1; workers <= 60; workers++) {
        const capacity = quote(company, market, 1, workers, buy, null, round === 1, round).productionCapacity;
        const first = quote(company, market, 0, workers, buy, null, round === 1, round);
        const quantity = Math.min(capacity, Math.max(0, Math.floor((company.cash - first.netCashCost) / first.unitMaterialCost)));
        const cost = quote(company, market, quantity, workers, buy, null, round === 1, round);
        if (cost.netCashCost > company.cash) continue;
        const score = quantity * market.announcedPrice - cost.economicCost;
        if (!best || score > best.score) best = { buy, workers, quantity, cost, score };
      }
    }
    if (!best) { rounds.push({ round, blocked: true }); break; }
    const { buy, workers, quantity, cost } = best;
    inventory += quantity;
    const offer = round % cycle === 0 ? inventory : 0;
    const plan = { id: 'sim', companyId: 'sim', offeredQuantity: offer, producedQuantity: quantity, askingPrice: 1, upgradesAfter: company.upgrades };
    const result = clearing(market, [plan], 1);
    const sold = result.soldByPlan.get('sim') || 0;
    const revenue = sold * result.marketPrice;
    inventory -= sold;
    company.cash += revenue - cost.netCashCost;
    profit += revenue - cost.economicCost;
    if (buy) company.machineAssets.push({ id: String(round), marketId: market.id, quantity: buy, purchasePrice: market.machinePrice, purchasedRound: round });
    company.machineCount += buy;
    if (workers !== company.employeeCount) company.lastHiringRound = workers > company.employeeCount ? round : round - 1;
    company.employeeCount = workers;
    rounds.push({ round, workers, machines: company.machineCount, quantity, sold, inventory, profit: Math.round(revenue - cost.economicCost), cash: Math.round(company.cash) });
  }
  return { market: base.id, cycle, land, priceFactor, buys, profit: Math.round(profit), cash: Math.round(company.cash), inventory, rounds };
};
const rice = MARKETS.find(m => m.id === 'market_toy');
const { normalizeRoom } = await import('../src/services/roomService.ts');
const migrated = normalizeRoom('test', { markets: [{ ...rice, productionCycleRounds: 3, riceBalanceVersion: undefined, firstWorkerProductivity: 81 }] });
assert.equal(migrated.markets[1].productionCycleRounds, 1);
assert.equal(migrated.markets[1].firstWorkerProductivity, 58.5);
assert.equal(normalizeRoom('test', migrated).markets[1].firstWorkerProductivity, 58.5);
const results = [simulate(MARKETS[0],1,undefined), simulate(MARKETS[2],1,undefined), simulate({...rice,riceMachineProductivityBoost:.12},1,600), simulate({...rice,riceMachineProductivityBoost:.12},1,undefined), simulate(rice,1,rice.landCapacityPerCycle)];
assert.equal(results[4].rounds.length,12);
assert.ok(results[4].rounds.every(r => r.sold > 0 && r.cash >= 0));
assert.ok(results[4].rounds.some(r => r.quantity > 600));
assert.equal(migrated.markets[1].landCapacityPerCycle,0);
assert.ok(results[4].profit / results[0].profit < 1.15);
console.table(results.map(({ rounds: _rounds, ...summary }) => summary));
if (process.argv.includes('--details')) for (const r of results) { console.log(r.market, r.cycle, r.land); console.table(r.rounds); }
for (const buys of [false,true]) for (const price of [.8,1,1.2]) {
  const runs = [simulate(MARKETS[0],1,undefined,price,buys),simulate(rice,1,rice.landCapacityPerCycle,price,buys),simulate(MARKETS[2],1,undefined,price,buys)];
  console.table(runs.map(({ rounds: _rounds, ...summary }) => summary));
}
