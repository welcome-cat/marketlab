import assert from 'node:assert/strict';
process.env.BALANCE_IMPORT_ONLY = '1';
await import('./review-ten-rounds.mjs');
const {MARKETS, DEMAND_EVENT_OPTIONS}=await import('../src/types/domain.ts');
const {normalizeRoom,transitionMarkets}=await import('../src/services/roomService.ts');
const {calculateCompetitiveMarket:price,calculateRepresentativeMarketSupply:supply,calculateMarketClearing:clear}=await import('../src/services/productionService.ts');
const event=(market,demand='baseline',offer='supply_baseline')=>{
 const d=DEMAND_EVENT_OPTIONS.find(x=>x.id===demand),s=DEMAND_EVENT_OPTIONS.find(x=>x.id===offer);
 return {marketId:market.id,optionId:d.id,supplyOptionId:s.id,effectType:'DEMAND',multiplier:d.multiplier,supplyCurveMultiplier:s.supplyMultiplier||1,demandIntensity:'MEDIUM',supplyIntensity:'MEDIUM'};
};
for(const m of MARKETS.filter(m=>m.marketType==='PERFECT_COMPETITION')){
 const baseline=event(m);
 const advance=(market,previous,next)=>transitionMarkets({markets:[market],demandEvents:[previous]},[next])[0];
 for(const quantity of [0,1,10000,100000000]) assert.equal(price(m,quantity).marketPrice,price(m,0).marketPrice);
 const permanent={...baseline,optionId:'population_up',multiplier:1.2};
 const increased=advance(m,baseline,permanent);
 assert.equal(supply(increased,m.basePrice),supply(m,m.basePrice));
 assert.ok(price(increased,0).marketPrice>price(m,0).marketPrice);
 const loaded=normalizeRoom('offline',{markets:[increased]}).markets.find(x=>x.id===m.id);
 assert.equal(loaded.demandAtBasePrice,increased.demandAtBasePrice);
 const unchanged=advance(loaded,permanent,baseline);
 assert.equal(price(unchanged,0).marketPrice,price(increased,0).marketPrice);
 const temporary=event(m,'income_up');
 const shock=advance(unchanged,baseline,temporary);
 const recovered=advance(shock,temporary,baseline);
 assert.ok(Math.abs(recovered.demandAtBasePrice-unchanged.demandAtBasePrice)<1e-6);
 assert.equal(price(recovered,0).marketPrice,price(unchanged,0).marketPrice);
 const stable=advance(recovered,baseline,baseline);
 assert.equal(price(stable,0).marketPrice,price(recovered,0).marketPrice);
 const storm=event(m,'baseline','rice_typhoon');
 const damaged=advance(unchanged,baseline,storm);
 const restored=advance(damaged,storm,baseline);
 assert.ok(Math.abs(restored.supplyShiftMultiplier-unchanged.supplyShiftMultiplier)<1e-9);
 assert.equal(price(restored,0).marketPrice,price(unchanged,0).marketPrice);
 const repeated=advance(increased,permanent,permanent);
 assert.ok(price(repeated,0).marketPrice>price(increased,0).marketPrice);
 assert.equal(clear(unchanged,[]).marketPrice,price(unchanged,0).marketPrice);
 for(const intensity of ['WEAK','STRONG']) {
   const incident={...temporary,demandIntensity:intensity};
   const affected=advance(unchanged,baseline,incident);
   const next=advance(affected,incident,permanent);
   assert.ok(Math.abs(next.demandAtBasePrice-unchanged.demandAtBasePrice*1.2)<1e-6);
 }
 const tax={...baseline,supplyOptionId:'producer_tax',producerTaxPerUnit:100};
 const taxed=advance(unchanged,baseline,tax);
 assert.equal(advance(taxed,tax,baseline).producerTaxPerUnit,100);
 assert.deepEqual(normalizeRoom('offline',normalizeRoom('offline',{markets:[unchanged]})).markets,normalizeRoom('offline',{markets:[unchanged]}).markets);
 console.log(m.name,'PASS', {baseline:price(m,0).marketPrice,increased:price(increased,0).marketPrice,repeated:price(repeated,0).marketPrice});
}
console.log('News persistence, recovery, independent supply and price-taking checks passed.');
