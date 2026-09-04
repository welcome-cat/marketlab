// 교육용 시장의 기준값이 바뀔 때 세 비교우위 기업을 같은 조건으로 10라운드 비교한다.
const markets = [
  { id: 'cafe', price: 900, material: 580 * .94, wage: 1500, rent: 3500, setup: 5000, machinePrice: 9000, first: 55 * 1.15, linear: .28, quadratic: .03, cycle: 1, land: Infinity },
  { id: 'rice', price: 500, material: 180 * .78 * .88, wage: 2200, rent: 4000, setup: 8000, machinePrice: 30000, first: 90 * 1.2, linear: .38, quadratic: .045, cycle: 3, land: 700 },
  { id: 'shoes', price: 3200, material: 2300 * 1.14 * .9, wage: 2600, rent: 7000, setup: 12000, machinePrice: 22000, first: 32 * 1.15, linear: .32, quadratic: .035, cycle: 1, land: Infinity },
];

const production = (market, workers, machines) => {
  let capacity = 0, profitMaximizingQuantity = 0;
  let potentialCapacity = 0;
  for (let worker = 0; worker < 60; worker += 1) {
    const laborLoad = worker / (1 + .2 * (machines - 1));
    const capitalBoost = market.id === 'rice' ? 1 + (machines - 1) * .12 : 1;
    const marginalProduct = market.first * capitalBoost / (1 + market.linear * laborLoad + market.quadratic * laborLoad ** 2);
    potentialCapacity += marginalProduct;
    if (worker < workers) capacity += marginalProduct;
    if (market.material + market.wage / marginalProduct <= market.price) profitMaximizingQuantity = Math.floor(potentialCapacity);
  }
  return { capacity: Math.min(market.land, Math.floor(capacity)), optimum: Math.min(market.land, profitMaximizingQuantity) };
};

const simulate = (market) => {
  let cash = 300000, machines = 1, inventory = 0, cumulativeProfit = 0;
  const rounds = [];
  for (let round = 1; round <= 10; round += 1) {
    cash += 20000; // 매 라운드 경제 퀴즈 정답 보상
    let best = null;
    for (let buy = 0; buy <= 1 && machines + buy <= 10; buy += 1) for (let workers = 1; workers <= 60; workers += 1) {
      const { capacity: technicalQuantity, optimum } = production(market, workers, machines + buy);
      const setup = round === 1 ? market.setup : 0;
      const rent = market.id === 'cafe' ? (machines + buy === 1 ? 3500 : machines + buy === 2 ? 8000 : machines + buy <= 4 ? 16000 : 28000) : market.id === 'rice' ? market.rent * (1 + (machines + buy - 1) * .2) : market.rent;
      const fixedOutlay = workers * market.wage + rent + setup + buy * market.machinePrice;
      const affordableQuantity = Math.max(0, Math.floor((cash - fixedOutlay) / market.material));
      const quantity = Math.max(0, Math.min(technicalQuantity, optimum, affordableQuantity));
      const outlay = Math.round(quantity * market.material + fixedOutlay);
      if (outlay > cash) continue;
      const sold = market.cycle === 1 ? quantity : round % market.cycle === 0 ? inventory + quantity : 0;
      const revenue = sold * market.price;
      const profit = revenue - Math.round(quantity * market.material + workers * market.wage + rent + setup / 4 + buy * market.machinePrice * .05);
      const score = market.cycle === 1 ? profit : quantity * (market.price - market.material) - workers * market.wage - rent - buy * market.machinePrice * .05;
      if (!best || score > best.score) best = { buy, workers, quantity, optimum, cashConstrained: affordableQuantity < Math.min(technicalQuantity, optimum), capacityConstrained: technicalQuantity < optimum, outlay, revenue, profit, score };
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
for (const result of results) console.log(`\n${result.market}`, result.rounds.map(({ round, workers, machines, quantity, optimum, cashConstrained, capacityConstrained, profit, cash }) => ({ round, workers, machines, quantity, optimum, cashConstrained, capacityConstrained, profit, cash })));
