// Offline strategy search. No classroom data or balance settings are changed.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
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
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { MARKETS, EMPTY_UPGRADES, DEFAULT_UNLOCK_ROUNDS } = await import('../src/types/domain.ts');
const { calculateProductionQuote: quote, calculateMarketClearing: clearing, calculateMarketDemand: demand } = await import('../src/services/productionService.ts');
const width = Number(process.argv[2] || 12);
const allowUpgrades = !process.argv.includes('--no-upgrades');
const competitorCount = Number(process.argv.find(x => x.startsWith('--peers='))?.split('=')[1] || 0);
export function search(market, { horizon = 10, beamWidth = width } = {}) {
  const company = { cash: 300000, employeeCount: 1, lastHiringRound: 0, machineCount: 1, machineAssets: [], upgrades: { ...EMPTY_UPGRADES }, technologyLevel: 0,
    industryTraitId: market.id === 'market_toy' ? 'industry_agriculture' : market.id === 'market_tumbler' ? 'industry_service' : 'industry_fashion',
    productionProfile: { firstWorkerProductivity: 55, productivityDecline: 4, technologyBoostRate: 0, researchBaseCost: 2500 } };
  let states = [{ company, profit: 0, reference: market.basePrice, rounds: [] }];
  for (let round = 1; round <= horizon; round++) {
    const candidates = [];
    for (const state of states) {
      const minimum = Math.round(state.reference * .7), maximum = Math.round(state.reference * 1.3);
      const sales = new Map();
      const sale = quantity => {
        if (sales.has(quantity)) return sales.get(quantity);
        let price = minimum;
        if (market.priceControl === 'FIRM_PRICE') {
          // Highest allowed integer price selling this quantity under symmetric peer offers.
          let lo = minimum, hi = maximum;
          while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (demand(market, mid, 1 / (1 + market.competitionSensitivity * competitorCount)) >= quantity * (competitorCount + 1)) lo = mid; else hi = mid - 1; }
          price = lo;
        }
        const plans = Array.from({ length: competitorCount + 1 }, (_, i) => ({ id: String(i), companyId: String(i), producedQuantity: quantity, offeredQuantity: quantity, askingPrice: price, upgradesAfter: state.company.upgrades }));
        const result = clearing(market, plans);
        const sold = result.soldByPlan.get('0') || 0;
        const actualPrice = market.priceControl === 'FIRM_PRICE' ? price : result.marketPrice;
        const answer = { sold, price, revenue: sold * actualPrice, reference: result.marketPrice };
        sales.set(quantity,answer); return answer;
      };
      for (let buy = 0; buy <= (round >= DEFAULT_UNLOCK_ROUNDS.machines ? 2 : 0); buy++) {
        if (state.company.machineCount + buy > market.maxMachines) continue;
        const options = [null, ...Object.keys(EMPTY_UPGRADES).filter(key => allowUpgrades && round >= DEFAULT_UNLOCK_ROUNDS[key] && state.company.upgrades[key] < 3)];
        for (const upgrade of options) {
          let best;
          for (let workers = 1; workers <= 100; workers++) {
            const fixed = quote(state.company, market, 0, workers, buy, upgrade, round === 1, round);
            const cap = Math.min(fixed.productionCapacity, Math.floor((state.company.cash - fixed.netCashCost) / fixed.unitMaterialCost));
            if (cap < 1) continue;
            let quantity = cap, trade;
            if (market.priceControl === 'FIRM_PRICE') {
              let margin = -Infinity;
              for (let q = 1; q <= cap; q++) { const t = sale(q); if (t.sold !== q) continue; const m = t.revenue - q * fixed.unitMaterialCost; if (m > margin) { margin = m; quantity = q; trade = t; } }
              if (!trade) continue;
            } else trade = sale(quantity);
            if (trade.sold !== quantity) continue;
            const cost = quote(state.company, market, quantity, workers, buy, upgrade, round === 1, round);
            const profit = trade.revenue - cost.economicCost;
            if (!best || profit > best.profit) best = { cost, workers, quantity, trade, profit };
          }
          if (!best) continue;
          const { cost,workers,quantity,trade,profit } = best;
          const next = { ...state.company, cash: state.company.cash + trade.revenue - cost.netCashCost, employeeCount: workers, lastHiringRound: workers > state.company.employeeCount ? round : workers < state.company.employeeCount ? round - 1 : state.company.lastHiringRound,
            machineCount: cost.machineCountAfter, upgrades: cost.upgradesAfter,
            machineAssets: [...state.company.machineAssets, ...(buy ? [{ id: String(round),marketId: market.id,quantity: buy,purchasePrice: market.machinePrice,purchasedRound: round }] : [])] };
          if (next.cash < 0) throw new Error('Unaffordable action');
          candidates.push({company: next, profit: state.profit + profit, reference: trade.reference, score: state.profit + profit + (horizon-round)*profit,
            rounds: [...state.rounds,{ round,workers,machines:next.machineCount,buy,upgrade:upgrade || '-',quantity,price:trade.price,sold:trade.sold,profit:Math.round(profit),cumulative:Math.round(state.profit+profit),cash:Math.round(next.cash) }] });
        }
      }
    }
    // Keep varied investment paths, not just near-identical hiring alternatives.
    candidates.sort((a,b)=>b.score-a.score);
    const unique = new Map();
    for (const candidate of candidates) { const key = JSON.stringify([candidate.company.machineCount,candidate.company.upgrades,candidate.company.employeeCount]); if (!unique.has(key)) unique.set(key,candidate); }
    states = [...unique.values()].slice(0,beamWidth);
    if (!states.length) throw new Error('No viable strategy');
  }
  states.sort((a,b)=>b.profit-a.profit);
  const winner = states[0];
  return {market:market.name,width:beamWidth,allowUpgrades,competitorCount,profit:Math.round(winner.profit),cash:Math.round(winner.company.cash),upgrades:winner.company.upgrades,rounds:winner.rounds};
}
if (!process.env.BALANCE_IMPORT_ONLY) for (const market of MARKETS) console.log(JSON.stringify(search(market)));
