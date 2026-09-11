process.env.BALANCE_IMPORT_ONLY = '1';
const { search } = await import('./review-ten-rounds.mjs');
const { MARKETS, GAME_THEORY_MARKETS } = await import('../src/types/domain.ts');
if (process.argv.includes('--phone')) {
  for (const first of [4,6]) for (const boost of [.2,.4]) for (const size of [120,180]) {
    const r = search({...GAME_THEORY_MARKETS[0],firstWorkerProductivity:first,machineProductivityBoost:boost,demandAtBasePrice:size},{beamWidth:3});
    console.log(JSON.stringify({first,boost,size,profit:r.profit,firstProfit:r.rounds[0].profit,last:r.rounds.at(-1)}));
  }
} else {
  for (const [i,config] of [[1,{workerTrainingRate:.07,advancedEquipmentRate:.18}],[2,{materialEfficiencyRate:.029,advancedEquipmentRate:.06,ecoMaterialRate:.01}],[2,{materialEfficiencyRate:.03,advancedEquipmentRate:.04,ecoMaterialRate:.01}]]) for (const horizon of [10,15]) {
    const r = search({...MARKETS[i],...config},{beamWidth:8,horizon});
    console.log(JSON.stringify({market:r.market,profit:r.profit,config,horizon}));
  }
}
