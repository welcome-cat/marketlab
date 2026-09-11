import assert from 'node:assert/strict';
process.env.BALANCE_IMPORT_ONLY='1';
const {search}=await import('./review-ten-rounds.mjs');
const {MARKETS,GAME_THEORY_MARKETS,EMPTY_UPGRADES}=await import('../src/types/domain.ts');
const {normalizeRoom}=await import('../src/services/roomService.ts');
const {calculateWorkerMarginalProduct:mp,calculateMarketClearing:clear,calculateProductionQuote:quote}=await import('../src/services/productionService.ts');
const migrated=normalizeRoom('offline',{markets:MARKETS});
assert.deepEqual(migrated.markets.map((market)=>market.id), ['market_tumbler','market_toy','market_shoes']);
const firm={cash:300000,employeeCount:1,lastHiringRound:0,machineAssets:[],upgrades:{...EMPTY_UPGRADES},technologyLevel:0,productionProfile:{firstWorkerProductivity:18,technologyBoostRate:0}};
for(const market of MARKETS){
 assert.ok(mp(firm,5,1,0,market)>mp(firm,6,1,0,market));
 assert.ok(mp(firm,6,2,0,market)>mp(firm,6,1,0,market));
 assert.ok(quote({...firm,upgrades:{...EMPTY_UPGRADES,materialEfficiency:1}},market,10,3).unitMaterialCost<quote(firm,market,10,3).unitMaterialCost);
}
for(const n of [1,2,3,4,6]){
 const plans=Array.from({length:n},(_,i)=>({id:String(i),companyId:String(i),askingPrice:14000,offeredQuantity:100,producedQuantity:100}));
 const result=clear(GAME_THEORY_MARKETS[0],plans);
 assert.equal(result.tradedQuantity,[...result.soldByPlan.values()].reduce((a,b)=>a+b,0));
 assert.ok([...result.soldByPlan.values()].every(q=>Number.isInteger(q)&&q>=0&&q<=100));
}
for(const horizon of [10,15]){
 const results=MARKETS.slice(0,3).map(m=>search(m,{horizon,beamWidth:24}));
 const center=results.reduce((s,r)=>s+r.profit,0)/3;
 assert.ok(results.every(r=>Math.abs(r.profit/center-1)<.06));
 console.log(JSON.stringify({horizon,results}));
}
