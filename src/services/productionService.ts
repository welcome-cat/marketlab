import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import { normalizeRoom } from './roomService';
import { EMPTY_UPGRADES } from '../types/domain';
import type { Company, CompanyUpgrades, InventoryItem, MachineAssetLot, Market, MarketRoundResult, ProductionPlan, Room, UpgradeType } from '../types/domain';

export interface ProductionQuote {
  rentCost: number; wageCost: number; unitMaterialCost: number; materialCost: number; policyCost: number; earlyTerminationCost: number; productionCost: number;
  machineInvestmentCost: number; researchCost: number; investmentCost: number; totalCost: number;
  setupCost: number;
  machineSales: number; machineResaleRevenue: number; netCashCost: number; marketMachineCountBefore: number;
  producedQuantity: number; workerCount: number; productionCapacity: number;
  currentMarginalProduct: number; nextMarginalProduct: number;
  averageCost: number; marginalCost: number | null; nextMarginalCost: number | null;
  supplyCurve: Array<{ quantity: number; marginalCost: number }>;
  machineCountAfter: number; technologyLevelAfter: number; spendingLimit: number;
  depreciationCost: number; allocatedInvestmentCost: number; economicCost: number;
  upgradePurchased: UpgradeType | null; upgradeCost: number; upgradesAfter: CompanyUpgrades;
  machineRepairCost: number; machineRepairs: number;
}

export const getTechnologyMarketFit = (company: Company, market: Market) => {
  // 스마트폰은 기업 특성과 관계없이 누구나 같은 조건에서 위험을 감수해 진입한다.
  if (market.id === 'market_smartphone') return { productivity: 1, material: 1, hint: '스마트폰 시장에서는 기업 특성 보정이 적용되지 않습니다.' };
  const favoredTrait = market.id === 'market_tumbler' ? 'industry_service' : market.id === 'market_toy' ? 'industry_agriculture' : 'industry_fashion';
  const favored = company.industryTraitId === favoredTrait;
  const industryProductivity = favored ? (market.id === 'market_toy' ? 1.2 : 1.15) : 0.92;
  const industryMaterial = favored ? (market.id === 'market_toy' ? 0.88 : market.id === 'market_shoes' ? 0.9 : 0.94) : 1.1;
  return {
    productivity: industryProductivity,
    material: industryMaterial,
    hint: favored ? '선택한 업종 경험이 이 시장과 잘 맞아 생산성과 재료 효율에 유리합니다.' : '업종 경험의 직접적인 비교우위는 작은 시장입니다.',
  };
};

export const calculateWorkerMarginalProduct = (
  company: Company,
  workerNumber: number,
  machineCount = company.machineCount || 1,
  technologyLevel = company.technologyLevel || 0,
  market?: Market,
) => {
  const profile = company.productionProfile;
  const marketFit = market ? getTechnologyMarketFit(company, market) : { productivity: 1 };
  const upgrades = { ...EMPTY_UPGRADES, ...(company.upgrades || {}) };
  const technologyAdjustedBase = (market?.firstWorkerProductivity ?? profile.firstWorkerProductivity) * marketFit.productivity * (1 + technologyLevel * profile.technologyBoostRate) * (1 + upgrades.workerTraining * 0.06);
  if (!market) {
    const fallback = technologyAdjustedBase - profile.productivityDecline * Math.floor((workerNumber - 1) / Math.max(1, machineCount));
    return Math.max(0, Math.round(fallback));
  }
  const machines = Math.max(1, machineCount);
  const effectiveMachines = 1 + Math.max(0, machines - 1) * (1 + upgrades.advancedEquipment * 0.12);
  const isRice = market.id === 'market_toy';
  const productivityBase = isRice ? technologyAdjustedBase * (1 + (machines - 1) * 0.12) : technologyAdjustedBase;
  // 노동자 한 명이 추가될 때마다 한계생산물이 연속적으로 체감한다.
  // 기계는 혼잡 증가 속도를 낮추지만, 분모 방식이라 추가 기계의 개선 폭도 점차 작아진다.
  const congestion = isRice ? workerNumber - 1 : (workerNumber - 1) / effectiveMachines;
  const baseDecayRate = Math.min(0.985, market.laborDecayRate + upgrades.workerTraining * 0.012);
  const decayRate = isRice ? Math.min(0.985, baseDecayRate + (machines - 1) * 0.005) : baseDecayRate;
  return Math.max(0.01, Number((productivityBase * Math.pow(decayRate, congestion)).toFixed(2)));
};

export const calculateProductionCapacity = (
  company: Company,
  workerCount: number,
  machineCount = company.machineCount || 1,
  technologyLevel = company.technologyLevel || 0,
  market?: Market,
) => {
  let capacity = 0;
  for (let worker = 1; worker <= workerCount; worker += 1) {
    capacity += calculateWorkerMarginalProduct(company, worker, machineCount, technologyLevel, market);
  }
  return Math.floor(capacity);
};

export const calculateFirmSupplyCurve = (
  company: Company,
  market: Market,
  workerCount: number,
  machineCount: number,
  technologyLevel: number,
) => {
  const upgrades = { ...EMPTY_UPGRADES, ...(company.upgrades || {}) };
  const unitMaterialCost = Math.round(market.materialUnitCost * market.materialCostMultiplier * getTechnologyMarketFit(company, market).material * Math.pow(0.95, upgrades.materialEfficiency) * Math.pow(0.98, upgrades.ecoProduction));
  const unitPolicyCost = (market.producerTaxPerUnit || 0) - (market.producerSubsidyPerUnit || 0);
  let cumulativeQuantity = 0;
  return Array.from({ length: workerCount }, (_, index) => {
    const marginalProduct = calculateWorkerMarginalProduct(company, index + 1, machineCount, technologyLevel, market);
    cumulativeQuantity += marginalProduct;
    return {
      quantity: Math.floor(cumulativeQuantity),
      marginalCost: Math.round(unitMaterialCost + unitPolicyCost + market.wagePerWorker / marginalProduct),
    };
  }).filter((point, index, points) => point.quantity > (points[index - 1]?.quantity ?? 0));
};

export const findFirmMarginalCost = (curve: Array<{ quantity: number; marginalCost: number }>, quantity: number) =>
  curve.find((point) => quantity <= point.quantity)?.marginalCost ?? null;

// 증원한 라운드의 다음 라운드까지 고용을 유지하고, 그 이후부터 감원할 수 있다.
// 규칙 도입 전에 만들어진 기업은 현재 라운드 한 번만 기존 인원을 보호한다.
export const calculateMinimumWorkerCount = (company: Company, currentRound: number) => {
  if (company.lastHiringRound === undefined) return company.employeeCount || 1;
  return currentRound <= company.lastHiringRound + 1 ? company.employeeCount || 1 : 1;
};

export const calculateFacilityRent = (market: Market, machineCount: number) => {
  const machines = Math.max(1, machineCount);
  if (market.id === 'market_tumbler') {
    if (machines === 1) return market.rentPerRound;
    if (machines === 2) return 8000;
    if (machines <= 4) return 16000;
    return 28000;
  }
  if (market.id === 'market_toy') return Math.round(market.rentPerRound * (1 + (machines - 1) * 0.2));
  return market.rentPerRound;
};

export const calculateResearchCost = (company: Company, researchLevels: number) => {
  let cost = 0;
  for (let index = 0; index < researchLevels; index += 1) {
    cost += company.productionProfile.researchBaseCost * (company.technologyLevel + index + 1);
  }
  return cost;
};

export const calculateUpgradeCost = (market: Market, company: Company, type: UpgradeType, workerCount: number) => {
  const currentLevel = company.upgrades?.[type] || 0;
  const levelFactor = currentLevel + 1;
  const typeFactor = type === 'advancedEquipment' ? 1.4 : type === 'workerTraining' ? 0.45 + workerCount * 0.08 : type === 'ecoProduction' ? 1.2 : 1;
  return Math.round(market.researchCost * levelFactor * typeFactor);
};

const marketMachineAssets = (company: Company, marketId: string) => (company.machineAssets || []).filter((asset) => asset.marketId === marketId);
export const getMarketMachineCount = (company: Company, marketId: string) => 1 + (company.machineAssets || []).filter((asset) => asset.marketId === marketId || asset.marketId === '*').reduce((sum, asset) => sum + asset.quantity, 0);
export const machineDepreciationRate = (asset: MachineAssetLot, currentRound: number) =>
  Math.min(1, Math.max(0, currentRound - (asset.lastRepairedRound ?? asset.purchasedRound)) * 0.05);
const resaleRate = (asset: MachineAssetLot, currentRound: number) =>
  Math.max(0, 0.3 - Math.max(0, currentRound - asset.purchasedRound - 1) * 0.05);
export const calculateMachineRepairCost = (company: Company, marketId: string, quantity: number, currentRound: number) =>
  marketMachineAssets(company, marketId)
    .filter((asset) => asset.purchasedRound < currentRound && machineDepreciationRate(asset, currentRound) > 0)
    .sort((a, b) => machineDepreciationRate(b, currentRound) - machineDepreciationRate(a, currentRound))
    .reduce((result, asset) => {
      const repaired = Math.min(Math.max(0, quantity - result.count), asset.quantity);
      return { count: result.count + repaired, cost: result.cost + Math.round(asset.purchasePrice * machineDepreciationRate(asset, currentRound) * 0.5) * repaired };
    }, { count: 0, cost: 0 }).cost;
export const calculateMachineResaleRevenue = (company: Company, marketId: string, quantity: number, currentRound: number) => {
  let remaining = quantity;
  return marketMachineAssets(company, marketId).filter((asset) => asset.purchasedRound < currentRound).sort((a, b) => a.purchasedRound - b.purchasedRound).reduce((sum, asset) => {
    const sold = Math.min(remaining, asset.quantity);
    remaining -= sold;
    return sum + Math.round(asset.purchasePrice * resaleRate(asset, currentRound)) * sold;
  }, 0);
};

export const calculateLoanTerms = (company: Company, inventories: InventoryItem[], currentRound: number) => {
  const machineCollateral = (company.machineAssets || []).reduce((sum, asset) => sum + Math.round(asset.purchasePrice * resaleRate(asset, currentRound)) * asset.quantity, 0);
  const inventoryCollateral = inventories.reduce((sum, item) => sum + Math.round(item.quantity * item.averageUnitCost * 0.5), 0);
  // 빌린 현금을 다시 담보로 삼아 반복 대출하는 것을 막기 위해 순현금만 인정한다.
  const recognizedAssets = Math.max(0, company.cash - (company.loanBalance || 0)) + machineCollateral + inventoryCollateral;
  const maximumTotalLoan = Math.round(recognizedAssets * 0.5);
  const loanBalance = company.loanBalance || 0;
  const debtRatio = recognizedAssets > 0 ? loanBalance / recognizedAssets : 1;
  const riskPremium = debtRatio <= 0.2 ? 0.5 : debtRatio <= 0.35 ? 1.5 : 3;
  const annualRate = Math.min(10, 4.5 + riskPremium);
  return { recognizedAssets, maximumTotalLoan, availableLoan: Math.max(0, maximumTotalLoan - loanBalance), annualRate, roundInterest: Math.round(loanBalance * (company.loanAnnualRate || annualRate) / 100 / 3) };
};

export const calculateProductionQuote = (
  company: Company,
  market: Market,
  requestedQuantity: number,
  workerCount: number,
  machinePurchases = 0,
  upgradePurchase: UpgradeType | null = null,
  includeSetupCost = false,
  currentRound = 1,
  machineSales = 0,
  machineRepairs = 0,
): ProductionQuote => {
  const marketAssets = marketMachineAssets(company, market.id);
  const activePurchasedMachines = marketAssets.filter((asset) => machineDepreciationRate(asset, currentRound) < 1).reduce((sum, asset) => sum + asset.quantity, 0);
  const repairedExpiredMachines = marketAssets.filter((asset) => machineDepreciationRate(asset, currentRound) >= 1).sort((a, b) => a.purchasedRound - b.purchasedRound).reduce((result, asset) => {
    const restored = Math.min(Math.max(0, machineRepairs - result.considered), asset.quantity);
    return { considered: result.considered + asset.quantity, restored: result.restored + restored };
  }, { considered: 0, restored: 0 }).restored;
  // 최초 지급 기계 1대는 기존 데이터와의 호환을 위해 기본 설비로 유지한다.
  const marketMachineCountBefore = 1 + activePurchasedMachines + repairedExpiredMachines;
  const machineCountAfter = marketMachineCountBefore + machinePurchases - machineSales;
  const upgradesAfter = { ...EMPTY_UPGRADES, ...(company.upgrades || {}) };
  if (upgradePurchase) upgradesAfter[upgradePurchase] += 1;
  const upgradedCompany = { ...company, upgrades: upgradesAfter };
  const technologyLevelAfter = company.technologyLevel || 0;
  const productionCapacity = calculateProductionCapacity(upgradedCompany, workerCount, machineCountAfter, technologyLevelAfter, market);
  const landLimitedCapacity = market.landCapacityPerCycle
    ? Math.min(productionCapacity, market.landCapacityPerCycle)
    : productionCapacity;
  const currentMarginalProduct = calculateWorkerMarginalProduct(upgradedCompany, workerCount, machineCountAfter, technologyLevelAfter, market);
  const nextMarginalProduct = calculateWorkerMarginalProduct(upgradedCompany, workerCount + 1, machineCountAfter, technologyLevelAfter, market);
  const rentCost = calculateFacilityRent(market, machineCountAfter);
  const wageCost = market.wagePerWorker * workerCount;
  const unitMaterialCost = Math.round(market.materialUnitCost * market.materialCostMultiplier * getTechnologyMarketFit(upgradedCompany, market).material * Math.pow(0.95, upgradesAfter.materialEfficiency) * Math.pow(0.98, upgradesAfter.ecoProduction));
  const materialCost = unitMaterialCost * requestedQuantity;
  const policyCost = ((market.producerTaxPerUnit || 0) - (market.producerSubsidyPerUnit || 0)) * requestedQuantity;
  const productionCost = rentCost + wageCost + materialCost + policyCost;
  const protectedWorkers = calculateMinimumWorkerCount(company, currentRound);
  const earlyTerminationCost = Math.max(0, protectedWorkers - workerCount) * Math.round(market.wagePerWorker * 0.25);
  const machineInvestmentCost = market.machinePrice * machinePurchases;
  const upgradeCost = upgradePurchase ? calculateUpgradeCost(market, company, upgradePurchase, workerCount) : 0;
  const researchCost = upgradeCost;
  const setupCost = includeSetupCost ? market.initialSetupCost : 0;
  const machineResaleRevenue = calculateMachineResaleRevenue(company, market.id, machineSales, currentRound);
  const machineRepairCost = calculateMachineRepairCost(company, market.id, machineRepairs, currentRound);
  const investmentCost = machineInvestmentCost + researchCost + setupCost + machineRepairCost;
  const totalCost = productionCost + investmentCost + earlyTerminationCost;
  const netCashCost = totalCost - machineResaleRevenue;
  const existingMachineDepreciation = marketMachineAssets(company, market.id).filter((asset) => machineDepreciationRate(asset, currentRound) < 1).reduce((sum, asset) => sum + Math.round(asset.purchasePrice * asset.quantity * 0.05), 0);
  const depreciationCost = existingMachineDepreciation + Math.round(machineInvestmentCost * 0.05);
  const allocatedInvestmentCost = depreciationCost + Math.round(researchCost / 3) + Math.round(setupCost / 4);
  // 수리는 당기 설비 유지비이므로 현금지출뿐 아니라 당기 이윤에도 전액 반영한다.
  const economicCost = productionCost + allocatedInvestmentCost + earlyTerminationCost + machineRepairCost;
  const supplyCurve = calculateFirmSupplyCurve(upgradedCompany, market, workerCount, machineCountAfter, technologyLevelAfter);
  const marginalCost = findFirmMarginalCost(supplyCurve, requestedQuantity);
  const nextMarginalCost = requestedQuantity < landLimitedCapacity ? findFirmMarginalCost(supplyCurve, requestedQuantity + 1) : null;

  return {
    rentCost, wageCost, unitMaterialCost, materialCost, policyCost, earlyTerminationCost, productionCost, machineInvestmentCost, researchCost, setupCost, investmentCost, totalCost,
    machineSales, machineResaleRevenue, netCashCost, marketMachineCountBefore,
    producedQuantity: requestedQuantity, workerCount, productionCapacity: landLimitedCapacity, currentMarginalProduct, nextMarginalProduct,
    // 교육용 당기 평균비용: 이번 라운드의 생산비와 투자비를 모두 생산량에 배분한다.
    averageCost: requestedQuantity > 0 ? Math.round(economicCost / requestedQuantity) : 0,
    marginalCost, nextMarginalCost, supplyCurve, machineCountAfter, technologyLevelAfter,
    spendingLimit: company.cash, depreciationCost, allocatedInvestmentCost, economicCost,
    upgradePurchased: upgradePurchase, upgradeCost, upgradesAfter, machineRepairCost, machineRepairs,
  };
};

interface ConfirmProductionInput {
  roomId: string; companyId: string; marketId: string; requestedQuantity: number;
  workerCount: number; machinePurchases: number; machineSales?: number; machineRepairs?: number; researchLevels?: number; upgradePurchase?: UpgradeType | null; askingPrice?: number; pricePrediction?: 'UP' | 'SAME' | 'DOWN';
}

const updateMachineAssets = (assets: MachineAssetLot[], marketId: string, sales: number, purchases: number, purchasePrice: number, roundNumber: number) => {
  let remainingSales = sales;
  const nextAssets = [...assets].sort((a, b) => a.purchasedRound - b.purchasedRound).flatMap((asset) => {
    if (asset.marketId !== marketId || asset.purchasedRound >= roundNumber || remainingSales === 0) return [asset];
    const sold = Math.min(remainingSales, asset.quantity);
    remainingSales -= sold;
    return asset.quantity > sold ? [{ ...asset, quantity: asset.quantity - sold }] : [];
  });
  if (purchases > 0) nextAssets.push({ id: crypto.randomUUID(), marketId, quantity: purchases, purchasePrice, purchasedRound: roundNumber });
  return nextAssets;
};

const repairMachineAssets = (assets: MachineAssetLot[], marketId: string, repairs: number, roundNumber: number) => {
  let remaining = repairs;
  return assets.sort((a, b) => machineDepreciationRate(b, roundNumber) - machineDepreciationRate(a, roundNumber)).flatMap((asset) => {
    if (asset.marketId !== marketId || remaining <= 0 || machineDepreciationRate(asset, roundNumber) <= 0) return [asset];
    const repaired = Math.min(remaining, asset.quantity);
    remaining -= repaired;
    return [{ ...asset, quantity: repaired, lastRepairedRound: roundNumber }, ...(asset.quantity > repaired ? [{ ...asset, id: `${asset.id}-remaining-${roundNumber}`, quantity: asset.quantity - repaired }] : [])];
  });
};

const deterministicChance = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967296;
};

// Smooth exponential demand. At the base price, demand equals the configured
// base quantity and the point elasticity equals the configured value.
export const calculateMarketDemand = (market: Market, price: number, demandMultiplier = 1) => {
  const normalizedPrice = Math.max(0, price) / Math.max(1, market.basePrice);
  const demandRatio = Math.exp(market.priceElasticity * (1 - normalizedPrice));
  return Math.max(0, Math.round(market.demandAtBasePrice * demandMultiplier * demandRatio));
};

export const scaleMarketEventFactor = (factor: number | undefined, effectScale: number) =>
  1 + ((factor ?? 1) - 1) * effectScale;

// 역공급함수 P(Q)=a+bQ+cQ²를 사용한다. Q가 늘수록 dP/dQ가 커져
// 시장 전체의 한계비용도 완만하게 체증한다. 기준점에서의 탄력성은
// market.supplyElasticity와 일치하도록 계수를 정한다.
export const calculateRepresentativeMarketSupply = (market: Market, price: number) => {
  if (market.marketType !== 'PERFECT_COMPETITION') return 0;
  // 종량세는 생산자가 실제로 받는 가격을 낮추고, 보조금은 높인다.
  // 같은 정책 금액을 학생 기업 비용과 시장 전체 공급곡선에 함께 반영한다.
  const supplyPrice = Math.max(0, price - (market.producerTaxPerUnit || 0) + (market.producerSubsidyPerUnit || 0));
  const baseQuantity = market.demandAtBasePrice;
  const basePrice = Math.max(1, market.basePrice);

  // 쌀은 생산을 시작하기 위한 최소 가격을 500원으로 두고,
  // 기준점 (900,000kg, kg당 500원)을 지나는 볼록한 2차 공급곡선을 사용한다.
  if (market.id === 'market_toy') {
    // 포대(10kg) 기준 가격을 kg 기준으로 환산했으므로 공급 시작가격도
    // 기존 500원에서 kg당 50원으로 같은 비율로 환산한다.
    const intercept = 50;
    if (supplyPrice <= intercept) return 0;
    const quadraticCoefficient = (basePrice - intercept) / (baseQuantity * baseQuantity);
    return Math.sqrt((supplyPrice - intercept) / quadraticCoefficient) * market.supplyShiftMultiplier;
  }

  // 카페는 기준점과 공급탄력성 0.80을 유지하면서 2차항의 비중을 높인다.
  // P(Q)=275+(125/Qe)Q+(500/Qe²)Q² 이므로 Q가 커질수록
  // 한계비용 dP/dQ가 뚜렷하게 가파르게 증가한다. (Qe=기준공급량)
  if (market.id === 'market_tumbler') {
    const intercept = 275;
    const linearCoefficient = 125 / baseQuantity;
    const quadraticCoefficient = 500 / (baseQuantity * baseQuantity);
    if (supplyPrice <= intercept) return 0;
    const discriminant = linearCoefficient * linearCoefficient - 4 * quadraticCoefficient * (intercept - supplyPrice);
    return Math.max(0, (-linearCoefficient + Math.sqrt(discriminant)) / (2 * quadraticCoefficient)) * market.supplyShiftMultiplier;
  }

  const elasticity = Math.max(0.05, market.supplyElasticity);
  const slopeAtEquilibrium = basePrice / (elasticity * baseQuantity);
  // P(0)=0과 b,c>=0을 유지하면서 기준점 탄력성을 맞춘다.
  // ε=0.5이면 순수 2차식, ε=0.8이면 선형항 60%+2차 기울기 40%다.
  const curvatureShare = Math.max(0, Math.min(1, 2 * (1 - elasticity)));
  const quadraticCoefficient = curvatureShare * slopeAtEquilibrium / (2 * baseQuantity);
  const linearCoefficient = (1 - curvatureShare) * slopeAtEquilibrium;
  const intercept = basePrice - linearCoefficient * baseQuantity - quadraticCoefficient * baseQuantity * baseQuantity;
  if (quadraticCoefficient <= 0) return Math.max(0, (supplyPrice - intercept) / Math.max(0.000001, linearCoefficient)) * market.supplyShiftMultiplier;
  const discriminant = linearCoefficient * linearCoefficient - 4 * quadraticCoefficient * (intercept - supplyPrice);
  if (discriminant <= 0) return 0;
  return Math.max(0, (-linearCoefficient + Math.sqrt(discriminant)) / (2 * quadraticCoefficient)) * market.supplyShiftMultiplier;
};

const solveCompetitivePrice = (market: Market, additionalSupply: number, demandMultiplier: number) => {
  let lowPrice = 0;
  let highPrice = Math.max(market.basePrice * 3, market.announcedPrice * 2);
  while (calculateRepresentativeMarketSupply(market, highPrice) + additionalSupply < calculateMarketDemand(market, highPrice, demandMultiplier) && highPrice < market.basePrice * 20) highPrice *= 1.5;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const price = (lowPrice + highPrice) / 2;
    const totalSupply = calculateRepresentativeMarketSupply(market, price) + additionalSupply;
    const demand = calculateMarketDemand(market, price, demandMultiplier);
    if (totalSupply < demand) lowPrice = price;
    else highPrice = price;
  }
  return (lowPrice + highPrice) / 2;
};

export const calculateCompetitiveMarket = (market: Market, studentSupply: number, demandMultiplier = 1) => {
  const effectiveStudentSupply = studentSupply * market.studentSupplyWeight;
  const priceWithoutStudentSupply = solveCompetitivePrice(market, 0, demandMultiplier);
  const unroundedMarketPrice = solveCompetitivePrice(market, effectiveStudentSupply, demandMultiplier);
  const marketPrice = Math.max(10, Math.round(unroundedMarketPrice / 10) * 10);
  return {
    marketPrice,
    unroundedMarketPrice,
    priceWithoutStudentSupply,
    studentPriceImpact: unroundedMarketPrice - priceWithoutStudentSupply,
    demandQuantity: calculateMarketDemand(market, marketPrice, demandMultiplier),
    effectiveStudentSupply,
    priceChangeRate: marketPrice / market.announcedPrice - 1,
  };
};

const allocateProportionally = (plans: ProductionPlan[], availableDemand: number) => {
  const allocations = new Map<string, number>();
  const totalOffered = plans.reduce((sum, plan) => sum + (plan.offeredQuantity ?? plan.producedQuantity), 0);
  const target = Math.min(totalOffered, Math.max(0, Math.floor(availableDemand)));
  if (target === 0 || totalOffered === 0) {
    plans.forEach((plan) => allocations.set(plan.id, 0));
    return allocations;
  }
  const shares = plans.map((plan) => {
    const offered = plan.offeredQuantity ?? plan.producedQuantity;
    const exact = target * offered / totalOffered;
    return { plan, offered, allocated: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = target - shares.reduce((sum, item) => sum + item.allocated, 0);
  shares.sort((a, b) => b.fraction - a.fraction).forEach((item) => {
    if (remainder > 0 && item.allocated < item.offered) { item.allocated += 1; remainder -= 1; }
  });
  shares.forEach((item) => allocations.set(item.plan.id, item.allocated));
  return allocations;
};

// Lowest asking-price production is offered to the highest willingness-to-pay
// buyers first. Firms posting the same price share that price level's demand.
const matchCheapestOffers = (
  offers: ProductionPlan[],
  demandAtPrice: (price: number) => number,
) => {
  const allocations = new Map<string, number>();
  offers.forEach((plan) => allocations.set(plan.id, 0));
  let matchedDemand = 0;
  const priceGroups = new Map<number, ProductionPlan[]>();
  offers.forEach((plan) => {
    const price = Math.round(plan.askingPrice || plan.announcedPrice);
    priceGroups.set(price, [...(priceGroups.get(price) || []), plan]);
  });
  [...priceGroups.entries()].sort(([priceA], [priceB]) => priceA - priceB).forEach(([price, group]) => {
    const remainingBuyers = Math.max(0, demandAtPrice(price) - matchedDemand);
    const groupAllocations = allocateProportionally(group, remainingBuyers);
    group.forEach((plan) => allocations.set(plan.id, groupAllocations.get(plan.id) || 0));
    matchedDemand += [...groupAllocations.values()].reduce((sum, quantity) => sum + quantity, 0);
  });
  return allocations;
};

export const calculateMarketClearing = (market: Market, plans: ProductionPlan[], demandMultiplier = 1) => {
  const soldByPlan = new Map<string, number>();
  const offers = plans.filter((plan) => (plan.offeredQuantity ?? plan.producedQuantity) > 0);
  const totalSupply = offers.reduce((sum, plan) => sum + (plan.offeredQuantity ?? plan.producedQuantity), 0);
  const participantCount = new Set(offers.map((plan) => plan.companyId)).size;
  let marketPrice = market.announcedPrice;
  let demandQuantity = calculateMarketDemand(market, marketPrice, demandMultiplier);
  if (market.marketType === 'OLIGOPOLY') {
    const competitionMultiplier = demandMultiplier / (1 + market.competitionSensitivity * Math.max(0, participantCount - 1));
    const allocations = matchCheapestOffers(offers, (price) => calculateMarketDemand(market, price, competitionMultiplier));
    allocations.forEach((quantity, planId) => soldByPlan.set(planId, quantity));
    demandQuantity = calculateMarketDemand(market, market.basePrice, competitionMultiplier);
    const matchedValue = offers.reduce((sum, plan) => sum + (soldByPlan.get(plan.id) || 0) * (plan.askingPrice || market.announcedPrice), 0);
    const matchedUnits = [...soldByPlan.values()].reduce((sum, quantity) => sum + quantity, 0);
    marketPrice = matchedUnits > 0 ? Math.round(matchedValue / matchedUnits) : market.announcedPrice;
  } else {
    const competitiveMarket = calculateCompetitiveMarket(market, totalSupply, demandMultiplier);
    marketPrice = competitiveMarket.marketPrice;
    demandQuantity = competitiveMarket.demandQuantity;
    const allocations = matchCheapestOffers(
      offers,
      (askingPrice) => askingPrice <= marketPrice ? demandQuantity : 0,
    );
    allocations.forEach((quantity, planId) => soldByPlan.set(planId, quantity));
  }
  const tradedQuantity = [...soldByPlan.values()].reduce((sum, quantity) => sum + quantity, 0);
  return {
    marketPrice,
    tradedQuantity,
    totalSupply,
    demandQuantity,
    soldByPlan,
    participantCount,
  };
};

export const productionService = {
  borrow: async (roomId: string, companyId: string, amount: number): Promise<void> => {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('INVALID_LOAN_AMOUNT');
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);
    const roomRef = doc(db, 'rooms', roomId);
    const inventorySnapshot = await getDocs(collection(companyRef, 'inventory'));
    const inventories = inventorySnapshot.docs.map((item) => item.data() as InventoryItem);
    await runTransaction(db, async (transaction) => {
      const [roomSnapshot, companySnapshot] = await Promise.all([transaction.get(roomRef), transaction.get(companyRef)]);
      if (!roomSnapshot.exists() || !companySnapshot.exists()) throw new Error('COMPANY_NOT_FOUND');
      const room = normalizeRoom(roomSnapshot.id, roomSnapshot.data() as Partial<Room>);
      if (room.currentRound < room.unlockRounds.loans || room.roundPhase !== 'DECISION') throw new Error('LOAN_FEATURE_LOCKED');
      const company = companySnapshot.data() as Company;
      const terms = calculateLoanTerms(company, inventories, room.currentRound);
      if (amount > terms.availableLoan) throw new Error('LOAN_LIMIT_EXCEEDED');
      const nextBalance = (company.loanBalance || 0) + amount;
      const nextDebtRatio = terms.recognizedAssets > 0 ? nextBalance / terms.recognizedAssets : 1;
      const nextRate = Math.min(10, 4.5 + (nextDebtRatio <= 0.2 ? 0.5 : nextDebtRatio <= 0.35 ? 1.5 : 3));
      transaction.update(companyRef, { cash: company.cash + amount, loanBalance: nextBalance, loanAnnualRate: nextRate, loanDueRound: room.currentRound + 3 });
    });
  },
  repayLoan: async (roomId: string, companyId: string, amount: number): Promise<void> => {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('INVALID_LOAN_AMOUNT');
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(companyRef);
      if (!snapshot.exists()) throw new Error('COMPANY_NOT_FOUND');
      const company = snapshot.data() as Company;
      if (amount > (company.loanBalance || 0) || amount > company.cash) throw new Error('LOAN_REPAYMENT_EXCEEDED');
      transaction.update(companyRef, { cash: company.cash - amount, loanBalance: (company.loanBalance || 0) - amount });
    });
  },
  confirmProduction: async (input: ConfirmProductionInput): Promise<ProductionPlan> => {
    const { roomId, companyId, marketId, requestedQuantity, workerCount, machinePurchases, machineSales = 0, machineRepairs = 0, upgradePurchase = null } = input;
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 0) throw new Error('INVALID_PRODUCTION_QUANTITY');
    if (!Number.isInteger(workerCount) || workerCount < 1) throw new Error('INVALID_WORKER_COUNT');
    if (!Number.isInteger(machinePurchases) || machinePurchases < 0) throw new Error('INVALID_INVESTMENT');
    if (machinePurchases > 1) throw new Error('MACHINE_PURCHASE_LIMIT');
    if (!Number.isInteger(machineSales) || machineSales < 0) throw new Error('INVALID_MACHINE_SALE');
    if (!Number.isInteger(machineRepairs) || machineRepairs < 0) throw new Error('INVALID_MACHINE_REPAIR');
    if (upgradePurchase && !['advancedEquipment', 'workerTraining', 'materialEfficiency', 'ecoProduction'].includes(upgradePurchase)) throw new Error('INVALID_INVESTMENT');

    const roomRef = doc(db, 'rooms', roomId);
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);

    return runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      const companySnapshot = await transaction.get(companyRef);
      if (!roomSnapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      if (!companySnapshot.exists()) throw new Error('COMPANY_NOT_FOUND');

      const room = normalizeRoom(roomSnapshot.id, roomSnapshot.data() as Partial<Room>);
      if (room.status !== 'RUNNING') throw new Error('ROOM_NOT_RUNNING');
      if (room.roundPhase !== 'DECISION') throw new Error('ROUND_DECISION_CLOSED');
      const market = room.markets.find((item) => item.id === marketId);
      if (!market) throw new Error('MARKET_NOT_FOUND');
      const isRice = market.id === 'market_toy';
      if (!isRice && requestedQuantity === 0) throw new Error('INVALID_PRODUCTION_QUANTITY');
      if (!Number.isFinite(input.askingPrice) || (input.askingPrice || 0) <= 0) throw new Error('INVALID_ASKING_PRICE');
      const company = companySnapshot.data() as Company;
      if (company.currentMarketId && company.currentMarketId !== market.id) throw new Error('MARKET_EXIT_REQUIRED');
      if (room.currentRound === 1 && company.traitsConfirmed === false) throw new Error('COMPANY_TRAITS_REQUIRED');
      const planId = `${companyId}_${room.currentRound}`;
      const planRef = doc(db, 'rooms', roomId, 'productionPlans', planId);
      const inventoryRef = doc(db, 'rooms', roomId, 'companies', companyId, 'inventory', marketId);
      const planSnapshot = await transaction.get(planRef);
      const inventorySnapshot = await transaction.get(inventoryRef);
      if (planSnapshot.exists()) throw new Error('PRODUCTION_ALREADY_CONFIRMED');

      const sellableMachines = marketMachineAssets(company, market.id).filter((asset) => asset.purchasedRound < room.currentRound).reduce((sum, asset) => sum + asset.quantity, 0);
      if (room.currentRound < room.unlockRounds.machines && (machinePurchases > 0 || machineSales > 0)) throw new Error('MACHINE_FEATURE_LOCKED');
      if (upgradePurchase && room.currentRound < room.unlockRounds[upgradePurchase]) throw new Error('UPGRADE_FEATURE_LOCKED');
      if (upgradePurchase && company.lastUpgradeRound === room.currentRound) throw new Error('UPGRADE_ALREADY_PURCHASED');
      if (upgradePurchase && (company.upgrades?.[upgradePurchase] || 0) >= 3) throw new Error('UPGRADE_MAX_LEVEL');
      if (machineSales > sellableMachines) throw new Error('INVALID_MACHINE_SALE');
      const riceCycleStartRound = room.currentRound - ((room.currentRound - 1) % Math.max(1, market.productionCycleRounds));
      const riceCycleProduced = isRice && company.riceCycleStartRound === riceCycleStartRound ? company.riceCycleProducedQuantity || 0 : 0;
      const landCapacity = market.landCapacityPerCycle || Number.POSITIVE_INFINITY;
      if (isRice && requestedQuantity > landCapacity) throw new Error('LAND_CAPACITY_EXCEEDED');
      const repairableMachines = marketMachineAssets(company, market.id).filter((asset) => asset.purchasedRound < room.currentRound && machineDepreciationRate(asset, room.currentRound) > 0).reduce((sum, asset) => sum + asset.quantity, 0);
      if (machineRepairs > repairableMachines) throw new Error('INVALID_MACHINE_REPAIR');
      const quote = calculateProductionQuote(company, market, requestedQuantity, workerCount, machinePurchases, upgradePurchase, !inventorySnapshot.exists(), room.currentRound, machineSales, machineRepairs);
      if (quote.machineCountAfter > market.maxMachines) throw new Error('FACILITY_LIMIT_EXCEEDED');
      if (quote.currentMarginalProduct <= 0) throw new Error('INVALID_WORKER_COUNT');
      if (requestedQuantity > quote.productionCapacity) throw new Error('PRODUCTION_CAPACITY_EXCEEDED');
      if (quote.netCashCost > quote.spendingLimit) throw new Error('SPENDING_LIMIT_EXCEEDED');
      if (company.cash < quote.netCashCost) throw new Error('INSUFFICIENT_CASH');

      const now = Date.now();
      const disasterEvent = room.demandEvents.find((event) => event.marketId === market.id);
      const disasterHit = isRice && (disasterEvent?.disasterLossChance || 0) > deterministicChance(`${roomId}:${companyId}:${room.currentRound}`);
      const producedQuantity = disasterHit ? Math.max(0, Math.floor(requestedQuantity * (1 - (disasterEvent?.disasterLossRate || 0)))) : requestedQuantity;
      const previous = inventorySnapshot.exists() ? inventorySnapshot.data() as InventoryItem : null;
      const previousQuantity = previous?.quantity ?? 0;
      const nextQuantity = previousQuantity + producedQuantity;
      const previousValue = previous ? previous.quantity * previous.averageUnitCost : 0;
      const isRiceHarvestRound = isRice && room.currentRound % market.productionCycleRounds === 0;
      const inventory: InventoryItem = {
        productId: market.id, productName: market.name, productIcon: market.icon, quantity: nextQuantity,
        averageUnitCost: nextQuantity > 0 ? Math.round((previousValue + quote.economicCost) / nextQuantity) : 0, updatedAt: now,
      };
      const plan: ProductionPlan = {
        id: planId, roomId, companyId, productId: market.id, marketName: market.name, announcedPrice: market.announcedPrice,
        roundNumber: room.currentRound, requestedQuantity, producedQuantity, workerCount,
        productionCapacity: quote.productionCapacity, marginalProduct: quote.currentMarginalProduct, marginalCost: quote.marginalCost,
        supplyCurve: quote.supplyCurve,
        rentCost: quote.rentCost, wageCost: quote.wageCost, materialCost: quote.materialCost, productionCost: quote.productionCost,
        earlyTerminationCost: quote.earlyTerminationCost,
        machinePurchases, machineCountAfter: quote.machineCountAfter, researchLevels: 0, technologyLevelAfter: quote.technologyLevelAfter,
        upgradePurchased: quote.upgradePurchased, upgradeCost: quote.upgradeCost, upgradesAfter: quote.upgradesAfter,
        investmentCost: quote.investmentCost, totalCost: quote.totalCost, openingCash: company.cash, spendingLimit: quote.spendingLimit,
        depreciationCost: quote.depreciationCost, allocatedInvestmentCost: quote.allocatedInvestmentCost,
        machineSales, machineResaleRevenue: quote.machineResaleRevenue, machineRepairs, machineRepairCost: quote.machineRepairCost,
        askingPrice: input.askingPrice, pricePrediction: input.pricePrediction || 'SAME', offeredQuantity: isRice ? (isRiceHarvestRound ? nextQuantity : 0) : producedQuantity, soldQuantity: 0, marketPrice: null, revenue: 0,
        profit: -quote.economicCost, operatingProfit: -quote.productionCost, economicProfit: -quote.economicCost,
        cashFlow: -quote.netCashCost, settlementStatus: 'PENDING',
        ...(isRice ? {
          riceCycleStage: isRiceHarvestRound ? 'HARVEST' as const : 'GROWING' as const,
          riceCycleStartRound,
          landCapacityPerCycle: market.landCapacityPerCycle,
          disasterLossQuantity: requestedQuantity - producedQuantity,
        } : {}),
        status: 'CONFIRMED', createdAt: now, confirmedAt: now,
      };

      transaction.update(companyRef, {
        cash: company.cash - quote.netCashCost,
        machineCount: 1 + (company.machineAssets || []).reduce((sum, asset) => sum + asset.quantity, 0) + machinePurchases - machineSales,
        employeeCount: workerCount,
        lastHiringRound: workerCount > (company.employeeCount || 1) ? room.currentRound : workerCount < (company.employeeCount || 1) ? room.currentRound - 1 : (company.lastHiringRound ?? room.currentRound - 1),
        machineAssets: repairMachineAssets(updateMachineAssets(company.machineAssets || [], market.id, machineSales, machinePurchases, market.machinePrice, room.currentRound), market.id, machineRepairs, room.currentRound),
        technologyLevel: quote.technologyLevelAfter,
        upgrades: quote.upgradesAfter,
        lastUpgradeRound: upgradePurchase ? room.currentRound : (company.lastUpgradeRound || null),
        productionTargets: { ...(company.productionTargets || {}), [market.id]: requestedQuantity },
        currentMarketId: market.id,
        ...(isRice ? { riceCycleStartRound, riceCycleProducedQuantity: riceCycleProduced + producedQuantity } : {}),
      });
      transaction.set(inventoryRef, inventory);
      transaction.set(planRef, plan);
      return plan;
    });
  },

  subscribeInventory: (roomId: string, companyId: string, productId: string, callback: (inventory: InventoryItem | null) => void): Unsubscribe =>
    onSnapshot(doc(db, 'rooms', roomId, 'companies', companyId, 'inventory', productId), (snapshot) =>
      callback(snapshot.exists() ? snapshot.data() as InventoryItem : null)),

  subscribeProductionPlan: (roomId: string, companyId: string, roundNumber: number, callback: (plan: ProductionPlan | null) => void): Unsubscribe => {
    const planRef = doc(db, 'rooms', roomId, 'productionPlans', `${companyId}_${roundNumber}`);
    return onSnapshot(planRef, (snapshot) => callback(snapshot.exists() ? snapshot.data() as ProductionPlan : null));
  },

  subscribeRoundProductionPlans: (
    roomId: string,
    roundNumber: number,
    callback: (plans: ProductionPlan[]) => void,
  ): Unsubscribe => {
    const plansQuery = query(
      collection(db, 'rooms', roomId, 'productionPlans'),
      where('roundNumber', '==', roundNumber),
    );
    return onSnapshot(plansQuery, (snapshot) => {
      callback(snapshot.docs.map((item) => item.data() as ProductionPlan));
    });
  },

  subscribeAllProductionPlans: (
    roomId: string,
    callback: (plans: ProductionPlan[]) => void,
  ): Unsubscribe => onSnapshot(
    collection(db, 'rooms', roomId, 'productionPlans'),
    (snapshot) => callback(snapshot.docs
      .map((item) => item.data() as ProductionPlan)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.companyId.localeCompare(b.companyId))),
  ),

  startSelling: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      if (room.status !== 'RUNNING' || room.roundPhase !== 'DECISION') throw new Error('ROUND_NOT_OPEN');
      const startedAt = Date.now();
      transaction.update(roomRef, { roundPhase: 'SELLING', sellingStartedAt: startedAt, sellingEndsAt: startedAt + 30000 });
    });
  },

  updateAskingPrice: async (roomId: string, companyId: string, roundNumber: number, nextPrice: number): Promise<void> => {
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) throw new Error('INVALID_ASKING_PRICE');
    const roomRef = doc(db, 'rooms', roomId);
    const planRef = doc(db, 'rooms', roomId, 'productionPlans', `${companyId}_${roundNumber}`);
    await runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      const planSnapshot = await transaction.get(planRef);
      if (!roomSnapshot.exists() || !planSnapshot.exists()) throw new Error('PLAN_NOT_FOUND');
      const room = normalizeRoom(roomSnapshot.id, roomSnapshot.data() as Partial<Room>);
      const plan = planSnapshot.data() as ProductionPlan;
      if (room.roundPhase !== 'SELLING' || Date.now() >= (room.sellingEndsAt || 0)) throw new Error('PRICE_UPDATE_CLOSED');
      const prediction = plan.pricePrediction || 'SAME';
      const minimum = Math.max(100, plan.announcedPrice * (prediction === 'DOWN' ? 0.7 : prediction === 'SAME' ? 0.95 : 1));
      const maximum = plan.announcedPrice * (prediction === 'UP' ? 1.3 : prediction === 'SAME' ? 1.05 : 1);
      if (nextPrice < minimum || nextPrice > maximum) throw new Error('PRICE_OUT_OF_RANGE');
      transaction.update(planRef, { askingPrice: Math.round(nextPrice), updatedAt: Date.now() });
    });
  },

  settleRound: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      if (room.status !== 'RUNNING' || room.roundPhase !== 'SELLING') throw new Error('ROUND_NOT_OPEN');
      if (Date.now() < (room.sellingEndsAt || 0)) throw new Error('SELLING_NOT_FINISHED');
      transaction.update(roomRef, { roundPhase: 'SETTLING' });
    });

    try {
    const roomDocument = await getDoc(roomRef);
    if (!roomDocument.exists()) throw new Error('ROOM_NOT_FOUND');
    const currentRoom = normalizeRoom(roomId, roomDocument.data() as Partial<Room>);
    const plansSnapshot = await getDocs(query(
      collection(db, 'rooms', roomId, 'productionPlans'),
      where('roundNumber', '==', currentRoom.currentRound),
    ));
    const candidatePlanRefs = plansSnapshot.docs.map((item) => item.ref);

    await runTransaction(db, async (transaction) => {
      const freshRoomSnapshot = await transaction.get(roomRef);
      if (!freshRoomSnapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(freshRoomSnapshot.id, freshRoomSnapshot.data() as Partial<Room>);
      if (room.status !== 'RUNNING' || room.roundPhase !== 'SETTLING') throw new Error('ROUND_NOT_OPEN');
      if (room.currentRound !== currentRoom.currentRound) throw new Error('ROUND_CHANGED');

      const planSnapshots = [];
      for (const planRef of candidatePlanRefs) planSnapshots.push(await transaction.get(planRef));
      const plans = planSnapshots.filter((item) => item.exists()).map((item) => item.data() as ProductionPlan);
      const companySnapshots = new Map<string, Awaited<ReturnType<typeof transaction.get>>>();
      const inventorySnapshots = new Map<string, Awaited<ReturnType<typeof transaction.get>>>();
      for (const plan of plans) {
        const companyRef = doc(db, 'rooms', roomId, 'companies', plan.companyId);
        const inventoryRef = doc(db, 'rooms', roomId, 'companies', plan.companyId, 'inventory', plan.productId);
        companySnapshots.set(plan.id, await transaction.get(companyRef));
        inventorySnapshots.set(plan.id, await transaction.get(inventoryRef));
      }

      const now = Date.now();
      const nextMarkets = room.markets.map((market) => {
        const marketPlans = plans.filter((plan) => plan.productId === market.id);
          const demandEvent = room.demandEvents.find((event) => event.marketId === market.id);
          const demandMultiplier = demandEvent?.effectType === 'SUPPLY' ? 1 : scaleMarketEventFactor(demandEvent?.multiplier, market.demandEventEffectScale);
          const clearing = calculateMarketClearing(market, marketPlans, demandMultiplier);
        const resultRef = doc(db, 'rooms', roomId, 'marketResults', `${room.currentRound}_${market.id}`);
        const result: MarketRoundResult = {
          id: `${room.currentRound}_${market.id}`, roomId, roundNumber: room.currentRound,
          marketId: market.id, marketName: market.name, referencePrice: market.announcedPrice,
          marketPrice: clearing.marketPrice, demandQuantity: clearing.demandQuantity,
          totalSupply: clearing.totalSupply, tradedQuantity: clearing.tradedQuantity,
          unsoldQuantity: clearing.totalSupply - clearing.tradedQuantity,
          participantCount: clearing.participantCount,
          totalRevenue: marketPlans.reduce((sum, plan) => sum + (clearing.soldByPlan.get(plan.id) || 0) * (market.priceControl === 'FIRM_PRICE' ? (plan.askingPrice || clearing.marketPrice || 0) : (clearing.marketPrice || 0)), 0),
          demandEventTitle: room.demandEvents.find((event) => event.marketId === market.id)?.title,
          settledAt: now,
        };
        transaction.set(resultRef, result);

        marketPlans.forEach((plan) => {
          const soldQuantity = clearing.soldByPlan.get(plan.id) || 0;
          const revenue = soldQuantity * (market.priceControl === 'FIRM_PRICE' ? (plan.askingPrice || clearing.marketPrice || 0) : (clearing.marketPrice || 0));
          const companySnapshot = companySnapshots.get(plan.id);
          const inventorySnapshot = inventorySnapshots.get(plan.id);
          if (!companySnapshot?.exists() || !inventorySnapshot?.exists()) return;
          const company = companySnapshot.data() as Company;
          const inventory = inventorySnapshot.data() as InventoryItem;
          const interestCost = Math.round((company.loanBalance || 0) * (company.loanAnnualRate || 0) / 100 / 3);
          transaction.update(companySnapshot.ref, { cash: company.cash + revenue - interestCost });
          transaction.update(inventorySnapshot.ref, {
            quantity: Math.max(0, inventory.quantity - soldQuantity),
            updatedAt: now,
          });
          transaction.update(doc(db, 'rooms', roomId, 'productionPlans', plan.id), {
            soldQuantity, marketPrice: market.priceControl === 'FIRM_PRICE' ? (plan.askingPrice || clearing.marketPrice) : clearing.marketPrice, revenue,
            profit: revenue - (plan.productionCost + (plan.allocatedInvestmentCost || plan.investmentCost)) - interestCost,
            operatingProfit: revenue - plan.productionCost,
            economicProfit: revenue - (plan.productionCost + (plan.allocatedInvestmentCost || plan.investmentCost)) - interestCost,
            cashFlow: revenue + (plan.machineResaleRevenue || 0) - plan.totalCost - interestCost,
            interestCost,
            settlementStatus: 'SETTLED',
          });
        });
        return market;
      });

      transaction.update(roomRef, { roundPhase: 'RESULT', markets: nextMarkets });
    });
    } catch (error) {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) return;
        const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
        if (room.roundPhase === 'SETTLING') transaction.update(roomRef, { roundPhase: 'DECISION' });
      });
      throw error;
    }
  },

  subscribeRoundResults: (
    roomId: string,
    roundNumber: number,
    callback: (results: MarketRoundResult[]) => void,
  ): Unsubscribe => {
    const resultsQuery = query(
      collection(db, 'rooms', roomId, 'marketResults'),
      where('roundNumber', '==', roundNumber),
    );
    return onSnapshot(resultsQuery, (snapshot) => callback(snapshot.docs.map((item) => item.data() as MarketRoundResult)));
  },

  subscribeAllResults: (
    roomId: string,
    callback: (results: MarketRoundResult[]) => void,
  ): Unsubscribe => onSnapshot(
    collection(db, 'rooms', roomId, 'marketResults'),
    (snapshot) => callback(
      snapshot.docs
        .map((item) => item.data() as MarketRoundResult)
        .sort((a, b) => a.roundNumber - b.roundNumber || a.marketId.localeCompare(b.marketId)),
    ),
  ),
};
