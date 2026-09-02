// 교육용 시장의 기준값이 바뀔 때 세 비교우위 기업을 같은 조건으로 10라운드 비교한다.
const markets = [
  { id: 'cafe', price: 900, material: 580 * .94, wage: 1500, rent: 3500, setup: 5000, machinePrice: 9000, first: 55 * 1.15, decay: .82, cycle: 1, land: Infinity },
  { id: 'rice', price: 500, material: 180 * .78 * .88, wage: 2200, rent: 4000, setup: 8000, machinePrice: 30000, first: 90 * 1.2, decay: .88, cycle: 3, land: 900 },
  { id: 'shoes', price: 3200, material: 2300 * 1.2 * .9, wage: 2600, rent: 7000, setup: 12000, machinePrice: 22000, first: 32 * 1.15, decay: .84, cycle: 1, land: Infinity },
];

const capacity = (market, workers, machines) => {
  let result = 0;
  for (let worker = 0; worker < workers; worker += 1) {
    const congestion = market.id === 'rice' ? worker : worker / Math.max(1, machines);
    const capitalBoost = market.id === 'rice' ? 1 + (machines - 1) * .12 : 1;
    result += market.first * capitalBoost * market.decay ** congestion;
  }
  return Math.min(market.land, Math.floor(result));
};

const simulate = (market) => {
  let cash = 300000, machines = 1, inventory = 0, cumulativeProfit = 0;
  const rounds = [];
  for (let round = 1; round <= 10; round += 1) {
    cash += 20000; // 매 라운드 경제 퀴즈 정답 보상
    let best = null;
    for (let buy = 0; buy <= 1 && machines + buy <= 10; buy += 1) for (let workers = 1; workers <= 20; workers += 1) {
      const technicalQuantity = capacity(market, workers, machines + buy);
      const setup = round === 1 ? market.setup : 0;
      const rent = market.id === 'cafe' ? (machines + buy === 1 ? 3500 : machines + buy === 2 ? 8000 : machines + buy <= 4 ? 16000 : 28000) : market.id === 'rice' ? market.rent * (1 + (machines + buy - 1) * .2) : market.rent;
      const fixedOutlay = workers * market.wage + rent + setup + buy * market.machinePrice;
      const quantity = Math.max(0, Math.min(technicalQuantity, Math.floor((cash - fixedOutlay) / market.material)));
      const outlay = Math.round(quantity * market.material + fixedOutlay);
      if (outlay > cash) continue;
      const sold = market.cycle === 1 ? quantity : round % market.cycle === 0 ? inventory + quantity : 0;
      const revenue = sold * market.price;
      const profit = revenue - Math.round(quantity * market.material + workers * market.wage + rent + setup / 4 + buy * market.machinePrice * .05);
      const score = market.cycle === 1 ? profit : quantity * (market.price - market.material) - workers * market.wage - rent - buy * market.machinePrice * .05;
      if (!best || score > best.score) best = { buy, workers, quantity, outlay, revenue, profit, score };
    }
    if (!best) throw new Error(`${market.id} round ${round}: no affordable action`);
    cash += best.revenue - best.outlay;
    machines += best.buy;
    inventory = market.cycle === 1 || round % market.cycle === 0 ? 0 : inventory + best.quantity;
    cumulativeProfit += best.profit;
    rounds.push({ round, ...best, cash: Math.round(cash), machines });
  }
  return { market: market.id, finalCash: Math.round(cash), cumulativeProfit: Math.round(cumulativeProfit), rounds };
};

const results = markets.map(simulate);
console.table(results.map(({ market, finalCash, cumulativeProfit }) => ({ market, finalCash, cumulativeProfit })));
for (const result of results) console.log(`\n${result.market}`, result.rounds.map(({ round, workers, machines, quantity, profit, cash }) => ({ round, workers, machines, quantity, profit, cash })));
