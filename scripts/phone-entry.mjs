process.env.BALANCE_IMPORT_ONLY = '1';
await import('./review-ten-rounds.mjs');
const { GAME_THEORY_MARKETS, EMPTY_UPGRADES, DEFAULT_UNLOCK_ROUNDS } = await import('../src/types/domain.ts');
const { calculateProductionQuote: quote, calculateMarketClearing: clear } = await import('../src/services/productionService.ts');
export function simulatePhone(config = {}, entries = [1], horizon = 15, aggressive = false) {
  const market = {...GAME_THEORY_MARKETS[0], ...config};
  const firms = entries.map((entry,i) => ({entry,id:String(i),cash:300000,employeeCount:1,lastHiringRound:0,machineCount:1,machineAssets:[],upgrades:{...EMPTY_UPGRADES},technologyLevel:0,productionProfile:{firstWorkerProductivity:18,productivityDecline:4,technologyBoostRate:0,researchBaseCost:14000},profit:0,inventory:0,history:[]}));
  let reference = market.basePrice;
  for (let round=1;round<=horizon;round++) {
    const active = firms.filter(f=>f.entry<=round);
    let plans = active.map(f=>({id:f.id,companyId:f.id,askingPrice:Math.round(reference),offeredQuantity:f.history.at(-1)?.quantity || 5,producedQuantity:0}));
    const choices = new Map();
    // Simultaneous best-response iterations, starting from last-round prices.
    for(let iteration=0;iteration<3;iteration++) {
      const nextPlans=[];
      for(const f of active) {
        const rivals=plans.filter(p=>p.id!==f.id);
        let best;
        const minimum=Math.round(reference*.7), maximum=Math.round(reference*1.3);
        const trades=[];
        for(let price=minimum;price<=maximum;price+=Math.max(1,Math.floor((maximum-minimum)/60))) {
          const probe={id:f.id,companyId:f.id,askingPrice:price,offeredQuantity:10000,producedQuantity:10000};
          trades.push({price,demand:clear(market,[...rivals,probe]).soldByPlan.get(f.id)||0});
        }
        const upgrades=[null,...Object.keys(EMPTY_UPGRADES).filter(k=>round>=DEFAULT_UNLOCK_ROUNDS[k]&&f.upgrades[k]<3)];
        for(let buy=0;buy<=(round>=2?2:0);buy++) {
          if(f.machineCount+buy>market.maxMachines)continue;
          for(const upgrade of upgrades) for(let workers=1;workers<=50;workers++) {
            const fixed=quote(f,market,0,workers,buy,upgrade,round===f.entry,round);
            const cap=Math.min(fixed.productionCapacity,Math.floor((f.cash-fixed.netCashCost)/fixed.unitMaterialCost));
            if(cap<1)continue;
            for(const t of trades) {
              const quantity=Math.min(cap,Math.max(1,t.demand-f.inventory));
              if(quantity<1)continue;
              const offered=quantity+f.inventory;
              const revenue=Math.min(offered,t.demand)*t.price;
              const profit=revenue-fixed.economicCost-quantity*fixed.unitMaterialCost;
              // Slightly value future cost savings in the aggressive investment scenario.
              const score=profit+(aggressive?Math.min(3,horizon-round)*fixed.upgradeCost/9:0);
              if(!best||score>best.score)best={workers,buy,upgrade,quantity,offered,price:t.price,profit,score};
            }
          }
        }
        if(!best) throw new Error('No feasible action '+f.id+' '+round);
        choices.set(f.id,best);
        nextPlans.push({id:f.id,companyId:f.id,askingPrice:best.price,offeredQuantity:best.offered,producedQuantity:best.quantity});
      }
      plans=nextPlans;
    }
    const clearing=clear(market,plans);
    for(const f of active) {
      const b=choices.get(f.id);
      const cost=quote(f,market,b.quantity,b.workers,b.buy,b.upgrade,round===f.entry,round);
      const sold=clearing.soldByPlan.get(f.id)||0;
      f.inventory += b.quantity-sold;
      const profit=sold*b.price-cost.economicCost;
      f.cash+=sold*b.price-cost.netCashCost; f.profit+=profit;
      if(b.buy)f.machineAssets.push({id:String(round),marketId:market.id,quantity:b.buy,purchasePrice:market.machinePrice,purchasedRound:round});
      f.machineCount+=b.buy; f.upgrades=cost.upgradesAfter;
      f.lastHiringRound=b.workers>f.employeeCount?round:b.workers<f.employeeCount?round-1:f.lastHiringRound; f.employeeCount=b.workers;
      f.history.push({round,workers:b.workers,machines:f.machineCount,upgrade:b.upgrade,quantity:b.quantity,sold,price:b.price,profit:Math.round(profit),cumulative:Math.round(f.profit),cash:Math.round(f.cash)});
      if(f.cash<0)throw new Error('Negative cash');
    }
    reference=clearing.marketPrice;
  }
  return firms.map(f=>({id:f.id,entry:f.entry,profit:Math.round(f.profit),cash:Math.round(f.cash),history:f.history}));
}
if(process.argv.includes('--sweep')) for(const size of [85,100]) for(const growth of [.7,1,1.3]) {
 const config={firstWorkerProductivity:3,machineProductivityBoost:.2,demandAtBasePrice:size,differentiatedDemand:true,entryDemandGrowth:growth};
 const solo=simulatePhone(config,[1],10), three=simulatePhone(config,[1,1,1],10);
 console.log(JSON.stringify({config,solo:solo[0].profit,first:solo[0].history[0].profit,machines:solo[0].history.at(-1).machines,three:three.map(f=>f.profit)}));
}
