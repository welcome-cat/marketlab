/** MarketLab core domain models */
export interface Market {
  id: string;
  name: string;
  description: string;
  icon: string;
  announcedPrice: number;
  /** 학생에게 공개되는 직전 정산가격. 현재 라운드의 잠정 균형가격과 분리한다. */
  publicPrice?: number | null;
  publicPriceRound?: number;
  basePrice: number;
  demandAtBasePrice: number;
  materialCostMultiplier: number;
  marketType: 'PERFECT_COMPETITION' | 'OLIGOPOLY';
  priceControl: 'MARKET_PRICE' | 'FIRM_PRICE';
  wagePerWorker: number;
  machinePrice: number;
  rentPerRound: number;
  materialUnitCost: number;
  firstWorkerProductivity: number;
  productivityDecline: number;
  initialSetupCost: number;
  researchCost: number;
  priceElasticity: number;
  competitionSensitivity: number;
  studentSupplyWeight: number;
  demandEventEffectScale: number;
  supplyEventEffectScale: number;
  supplyElasticity: number;
  laborDecayRate: number;
  productionCycleRounds: number;
  landCapacityPerCycle?: number;
  maxMachines: number;
  supplyShiftMultiplier: number;
  producerTaxPerUnit: number;
  producerSubsidyPerUnit: number;
  disasterLossRate: number;
}

export interface DemandEvent {
  marketId: string;
  factor: 'INCOME' | 'PREFERENCE' | 'RELATED_GOODS' | 'EXPECTATION' | 'CONSUMERS' | 'MATERIAL_COST' | 'WAGE' | 'TECHNOLOGY' | 'SUPPLIERS' | 'NATURAL_EVENT' | 'TAX_SUBSIDY' | 'BASELINE';
  effectType?: 'DEMAND' | 'SUPPLY';
  optionId: string;
  title: string;
  description: string;
  multiplier: number;
  demandIntensity?: 'WEAK' | 'MEDIUM' | 'STRONG';
  supplyIntensity?: 'WEAK' | 'MEDIUM' | 'STRONG';
  materialMultiplier?: number;
  wageMultiplier?: number;
  productivityMultiplier?: number;
  supplyMultiplier?: number;
  supplyOptionId?: string;
  supplyFactor?: DemandEvent['factor'];
  supplyTitle?: string;
  supplyDescription?: string;
  supplyMaterialMultiplier?: number;
  supplyWageMultiplier?: number;
  supplyRentMultiplier?: number;
  supplyProductivityMultiplier?: number;
  supplyCurveMultiplier?: number;
  producerTaxPerUnit?: number;
  producerSubsidyPerUnit?: number;
  disasterLossChance?: number;
  disasterLossRate?: number;
  /** 친환경 선호가 시장 총수요가 아니라 친환경 기업의 판매배분에 주는 가중치 */
  ecoPreferenceBoost?: number;
  articleHeadline: string;
  articleBody: string;
  supplyArticleHeadline?: string;
  supplyArticleBody?: string;
  generatedBy: 'AI' | 'TEMPLATE';
}

export interface DemandEventOption {
  id: string;
  factor: DemandEvent['factor'];
  title: string;
  description: string;
  multiplier: number;
  effectType?: 'DEMAND' | 'SUPPLY';
  materialMultiplier?: number;
  wageMultiplier?: number;
  productivityMultiplier?: number;
  supplyMultiplier?: number;
  temporary?: boolean;
  ecoPreferenceBoost?: number;
}

export type EventIntensity = 'WEAK' | 'MEDIUM' | 'STRONG';
export const EVENT_INTENSITY_SCALE: Record<EventIntensity, number> = { WEAK: 0.6, MEDIUM: 1, STRONG: 1.8 };
export const EVENT_INTENSITY_LABEL: Record<EventIntensity, string> = { WEAK: '약함', MEDIUM: '보통', STRONG: '강함' };

export const DEMAND_EVENT_OPTIONS: DemandEventOption[] = [
  { id: 'income_up', factor: 'INCOME', title: '일시적 소득 증가', description: '이번 라운드의 일시적 소득 증가로 정상재 수요가 증가합니다.', multiplier: 1.1, temporary: true },
  { id: 'income_down', factor: 'INCOME', title: '일시적 소득 감소', description: '이번 라운드의 일시적 소득 감소로 정상재 수요가 감소합니다.', multiplier: 0.9, temporary: true },
  { id: 'preference_up', factor: 'PREFERENCE', title: '단기 유행 발생', description: '단기 유행으로 이번 라운드의 상품 선호가 높아집니다.', multiplier: 1.12, temporary: true },
  { id: 'preference_down', factor: 'PREFERENCE', title: '단기 불매운동 발생', description: '일시적인 불매운동으로 이번 라운드의 상품 수요가 감소합니다.', multiplier: 0.88, temporary: true },
  { id: 'eco_preference', factor: 'PREFERENCE', title: '친환경 선호 증가', description: '시장 총수요는 그대로지만 친환경 생산 기업에 수요가 더 배분됩니다.', multiplier: 1, ecoPreferenceBoost: 0.18 },
  { id: 'substitute_up', factor: 'RELATED_GOODS', title: '대체재 가격 상승', description: '대체재 가격 상승으로 해당 상품 수요가 증가합니다.', multiplier: 1.1 },
  { id: 'substitute_down', factor: 'RELATED_GOODS', title: '대체재 가격 하락', description: '대체재 가격 하락으로 해당 상품 수요가 감소합니다.', multiplier: 0.9 },
  { id: 'complement_up', factor: 'RELATED_GOODS', title: '보완재 가격 상승', description: '보완재 가격 상승으로 해당 상품 수요가 감소합니다.', multiplier: 0.9 },
  { id: 'complement_down', factor: 'RELATED_GOODS', title: '보완재 가격 하락', description: '보완재 가격 하락으로 해당 상품 수요가 증가합니다.', multiplier: 1.1 },
  { id: 'expect_price_up', factor: 'EXPECTATION', title: '일시적 미래 가격 상승 예상', description: '가격 상승 예상으로 현재 구매가 앞당겨집니다.', multiplier: 1.08, temporary: true },
  { id: 'expect_price_down', factor: 'EXPECTATION', title: '일시적 미래 가격 하락 예상', description: '가격 하락 예상으로 현재 구매가 미뤄집니다.', multiplier: 0.92, temporary: true },
  { id: 'consumers_up', factor: 'CONSUMERS', title: '소비자 수 증가', description: '새 소비자 유입으로 시장 수요가 증가합니다.', multiplier: 1.12 },
  { id: 'consumers_down', factor: 'CONSUMERS', title: '소비자 수 감소', description: '소비자 이탈로 시장 수요가 감소합니다.', multiplier: 0.88 },
  { id: 'material_up', factor: 'MATERIAL_COST', effectType: 'SUPPLY', title: '원재료 가격 상승', description: '제품 1개당 재료비가 12% 상승해 공급이 감소합니다.', multiplier: 1, materialMultiplier: 1.12, supplyMultiplier: 0.94 },
  { id: 'material_down', factor: 'MATERIAL_COST', effectType: 'SUPPLY', title: '원재료 가격 하락', description: '제품 1개당 재료비가 10% 하락해 공급이 증가합니다.', multiplier: 1, materialMultiplier: 0.9, supplyMultiplier: 1.06 },
  { id: 'wage_up', factor: 'WAGE', effectType: 'SUPPLY', title: '시장 임금 상승', description: '노동자 임금이 10% 상승해 생산비가 증가합니다.', multiplier: 1, wageMultiplier: 1.1, supplyMultiplier: 0.95 },
  { id: 'wage_down', factor: 'WAGE', effectType: 'SUPPLY', title: '시장 임금 하락', description: '노동자 임금이 10% 하락해 생산비가 감소합니다.', multiplier: 1, wageMultiplier: 0.9, supplyMultiplier: 1.05 },
  { id: 'rent_up', factor: 'MATERIAL_COST', effectType: 'SUPPLY', title: '임대료 상승', description: '사업장 임대료가 상승해 생산자의 고정비 부담이 커집니다.', multiplier: 1, supplyMultiplier: 0.96 },
  { id: 'rent_down', factor: 'MATERIAL_COST', effectType: 'SUPPLY', title: '임대료 하락', description: '사업장 임대료가 하락해 생산자의 고정비 부담이 줄어듭니다.', multiplier: 1, supplyMultiplier: 1.04 },
  { id: 'technology_progress', factor: 'TECHNOLOGY', effectType: 'SUPPLY', title: '생산기술 확산', description: '산업 전반의 생산성이 10% 향상됩니다.', multiplier: 1, productivityMultiplier: 1.1, supplyMultiplier: 1.08 },
  { id: 'suppliers_up', factor: 'SUPPLIERS', effectType: 'SUPPLY', title: '공급자 수 증가', description: '새로운 기업의 진입으로 시장공급이 증가합니다.', multiplier: 1, supplyMultiplier: 1.1 },
  { id: 'suppliers_down', factor: 'SUPPLIERS', effectType: 'SUPPLY', title: '공급자 수 감소', description: '일부 기업의 퇴출로 시장공급이 감소합니다.', multiplier: 1, supplyMultiplier: 0.9 },
  { id: 'producer_expect_up', factor: 'EXPECTATION', effectType: 'SUPPLY', title: '일시적 미래 가격 상승 예상(생산자)', description: '생산자들이 미래 판매를 기다리며 현재 공급을 줄입니다.', multiplier: 1, supplyMultiplier: 0.9, temporary: true },
  { id: 'producer_expect_down', factor: 'EXPECTATION', effectType: 'SUPPLY', title: '일시적 미래 가격 하락 예상(생산자)', description: '생산자들이 판매를 앞당기며 현재 공급을 늘립니다.', multiplier: 1, supplyMultiplier: 1.1, temporary: true },
  { id: 'rice_typhoon', factor: 'NATURAL_EVENT', effectType: 'SUPPLY', title: '태풍으로 쌀 작황 악화', description: '이번 라운드에 쌀 시장 전체 공급이 감소하고 일부 농가는 수확 피해를 입습니다.', multiplier: 1, supplyMultiplier: 0.82, temporary: true },
  { id: 'producer_tax', factor: 'TAX_SUBSIDY', effectType: 'SUPPLY', title: '생산자 세금 부과', description: '생산에 추가 부담이 생겨 공급이 감소합니다.', multiplier: 1, materialMultiplier: 1.08, supplyMultiplier: 0.94 },
  { id: 'producer_subsidy', factor: 'TAX_SUBSIDY', effectType: 'SUPPLY', title: '생산 보조금 지급', description: '생산비 부담이 줄어 시장공급이 증가합니다.', multiplier: 1, materialMultiplier: 0.94, supplyMultiplier: 1.06 },
  { id: 'baseline', factor: 'BASELINE', title: '수요 변화 없음', description: '특별한 수요 변화 요인이 없습니다.', multiplier: 1 },
  { id: 'supply_baseline', factor: 'BASELINE', effectType: 'SUPPLY', title: '공급 변화 없음', description: '특별한 공급 변화 요인이 없습니다.', multiplier: 1, supplyMultiplier: 1 },
];

// 한 룸에 아래 세 시장이 동시에 열린다. 가격은 학생에게 공개되는 기준 시장가격이다.
export const MARKETS: Market[] = [
  { id: 'market_tumbler', name: '카페 음료 시장', description: '대체재가 많아 가격 변화에 수요가 민감한 대규모 가격수용 시장입니다.', icon: '☕', announcedPrice: 900, basePrice: 900, demandAtBasePrice: 180000, materialCostMultiplier: 0.58, marketType: 'PERFECT_COMPETITION', priceControl: 'MARKET_PRICE', wagePerWorker: 1500, machinePrice: 9000, rentPerRound: 3500, materialUnitCost: 1000, firstWorkerProductivity: 55, productivityDecline: 4, initialSetupCost: 5000, researchCost: 2500, priceElasticity: 1.3, competitionSensitivity: 0, studentSupplyWeight: 1, demandEventEffectScale: 1, supplyEventEffectScale: 1, supplyElasticity: 0.8, laborDecayRate: 0.82, productionCycleRounds: 1, maxMachines: 10, supplyShiftMultiplier: 1, producerTaxPerUnit: 0, producerSubsidyPerUnit: 0, disasterLossRate: 0 },
  { id: 'market_toy', name: '쌀 시장', description: '매 라운드 새 농지 한도 안에서 재배하고 3라운드 주기 마지막에 수확·판매하는 비탄력적 농산물 시장입니다.', icon: '🌾', announcedPrice: 500, basePrice: 500, demandAtBasePrice: 900000, materialCostMultiplier: 0.78, marketType: 'PERFECT_COMPETITION', priceControl: 'MARKET_PRICE', wagePerWorker: 2200, machinePrice: 30000, rentPerRound: 4000, materialUnitCost: 180, firstWorkerProductivity: 90, productivityDecline: 12, initialSetupCost: 8000, researchCost: 6500, priceElasticity: 0.4, competitionSensitivity: 0, studentSupplyWeight: 1, demandEventEffectScale: 1, supplyEventEffectScale: 1, supplyElasticity: 0.5, laborDecayRate: 0.88, productionCycleRounds: 3, landCapacityPerCycle: 700, maxMachines: 10, supplyShiftMultiplier: 1, producerTaxPerUnit: 0, producerSubsidyPerUnit: 0, disasterLossRate: 0 },
  { id: 'market_shoes', name: '운동화 시장', description: '설비·숙련·재료 관리가 고르게 필요해 기업의 생산방식에 따라 비교우위가 달라지는 경쟁시장입니다.', icon: '👟', announcedPrice: 3200, basePrice: 3200, demandAtBasePrice: 120000, materialCostMultiplier: 1.14, marketType: 'PERFECT_COMPETITION', priceControl: 'MARKET_PRICE', wagePerWorker: 2600, machinePrice: 22000, rentPerRound: 7000, materialUnitCost: 2300, firstWorkerProductivity: 32, productivityDecline: 4, initialSetupCost: 12000, researchCost: 5000, priceElasticity: 1.05, competitionSensitivity: 0, studentSupplyWeight: 1, demandEventEffectScale: 1, supplyEventEffectScale: 1, supplyElasticity: 0.65, laborDecayRate: 0.84, productionCycleRounds: 1, maxMachines: 10, supplyShiftMultiplier: 1, producerTaxPerUnit: 0, producerSubsidyPerUnit: 0, disasterLossRate: 0 },
  { id: 'market_smartphone', name: '스마트폰 시장', description: '고가의 부품·설비와 고임금이 필요한 고위험·고수익 과점시장입니다.', icon: '📱', announcedPrice: 10000, basePrice: 10000, demandAtBasePrice: 70, materialCostMultiplier: 2.1, marketType: 'OLIGOPOLY', priceControl: 'FIRM_PRICE', wagePerWorker: 6500, machinePrice: 65000, rentPerRound: 16000, materialUnitCost: 2860, firstWorkerProductivity: 18, productivityDecline: 7, initialSetupCost: 45000, researchCost: 14000, priceElasticity: 1.2, competitionSensitivity: 0.12, studentSupplyWeight: 1, demandEventEffectScale: 1, supplyEventEffectScale: 1, supplyElasticity: 0, laborDecayRate: 0.86, productionCycleRounds: 1, maxMachines: 8, supplyShiftMultiplier: 1, producerTaxPerUnit: 0, producerSubsidyPerUnit: 0, disasterLossRate: 0 },
];

export interface Room {
  id: string;
  title: string;
  markets: Market[];
  currentRound: number;
  status: 'WAITING' | 'RUNNING' | 'FINISHED';
  roundPhase: 'DECISION' | 'SELLING' | 'SETTLING' | 'RESULT';
  sellingStartedAt?: number;
  sellingEndsAt?: number;
  demandEvents: DemandEvent[];
  pendingDemandEvents: DemandEvent[];
  unlockRounds: UnlockRounds;
  economicsQuizzes: EconomicsQuiz[];
  quizSchedule?: Record<string, string | null>;
  newsTemplates?: Record<string, { headline: string; body: string }>;
  createdAt: number;
  // 이전 버전 룸 문서 호환용
  marketId?: string;
  marketName?: string;
  marketDescription?: string;
  marketIcon?: string;
}

export interface EconomicsQuiz {
  id: string;
  question: string;
  choices: [string, string, string];
  answer: number;
  reward: number;
}

export const DEFAULT_ECONOMICS_QUIZZES: EconomicsQuiz[] = [
  { id: 'mc-price', question: '완전경쟁기업이 이윤을 극대화하는 생산량의 조건은?', choices: ['가격=한계비용', '가격=평균비용', '총수입=고정비'], answer: 0, reward: 20000 },
  { id: 'demand-shift', question: '수요가 증가하고 공급이 그대로라면 일반적으로 균형가격은?', choices: ['상승', '유지', '하락'], answer: 0, reward: 20000 },
  { id: 'elasticity', question: '가격이 오를 때 수요량이 크게 감소하면 이 상품의 수요는?', choices: ['탄력적', '비탄력적', '완전비탄력적'], answer: 0, reward: 20000 },
  { id: 'marginal-cost', question: '기업이 생산량을 1단위 늘릴 때 추가되는 비용은?', choices: ['한계비용', '고정비용', '매몰비용'], answer: 0, reward: 20000 },
  { id: 'supply-input', question: '다른 조건이 같을 때 원재료 가격이 상승하면 시장 공급곡선은?', choices: ['왼쪽으로 이동', '오른쪽으로 이동', '이동하지 않음'], answer: 0, reward: 20000 },
  { id: 'producer-surplus', question: '시장가격이 한계비용보다 높을 때 추가 1단위 생산으로 얻는 차이는?', choices: ['생산자잉여', '소비자잉여', '고정비'], answer: 0, reward: 20000 },
];

export interface UnlockRounds {
  machines: number;
  advancedEquipment: number;
  workerTraining: number;
  materialEfficiency: number;
  ecoProduction: number;
  loans: number;
}
export const DEFAULT_UNLOCK_ROUNDS: UnlockRounds = { machines: 2, advancedEquipment: 2, workerTraining: 2, materialEfficiency: 2, ecoProduction: 4, loans: 5 };

export interface Technology { id: string; name: string; description: string; icon: string; }
export const TECHNOLOGIES: Technology[] = [
  { id: 'tech_automation', name: '자동화 공장', description: '로봇 자동화 라인을 갖추어 대량 생산에 강점이 있습니다.', icon: '🤖' },
  { id: 'tech_skilled_labor', name: '숙련 기술자 보유', description: '숙련된 인력을 바탕으로 노동생산성이 높습니다.', icon: '👨‍🔧' },
  { id: 'tech_precision', name: '정밀 가공 설비', description: '원자재 낭비가 적고 정밀 제품 생산에 강합니다.', icon: '🔬' },
  { id: 'tech_eco', name: '친환경 생산라인', description: '에너지와 재료를 효율적으로 사용하는 생산설비입니다.', icon: '🌿' },
];

export interface IndustryTrait { id: string; name: string; description: string; icon: string; favoredMarketId: string; }
export const INDUSTRY_TRAITS: IndustryTrait[] = [
  { id: 'industry_service', name: '고객 대응 경험', description: '빠른 주문 처리와 표준화된 서비스 운영 경험이 있습니다.', icon: '🧋', favoredMarketId: 'market_tumbler' },
  { id: 'industry_agriculture', name: '농업 생산 경험', description: '작황 관리와 농산물 생산 과정에 익숙합니다.', icon: '🚜', favoredMarketId: 'market_toy' },
  { id: 'industry_fashion', name: '패션 제조 경험', description: '디자인 변경과 신발 조립 공정에 익숙합니다.', icon: '🧵', favoredMarketId: 'market_shoes' },
];

export const INITIAL_COMPANY_CASH = 300000;

export interface StudentMember {
  studentNumber: string;
  name: string;
}

export interface Company {
  id: string; roomId: string; name: string; normalizedName?: string; cash: number;
  technologyId: string; technologyName: string; technologyDescription: string; technologyIcon: string;
  industryTraitId?: string;
  industryTraitName?: string;
  industryTraitDescription?: string;
  industryTraitIcon?: string;
  traitsConfirmed?: boolean;
  upgrades?: CompanyUpgrades;
  lastUpgradeRound?: number;
  productionProfile: ProductionProfile;
  machineCount: number;
  employeeCount: number;
  lastHiringRound?: number;
  machineAssets: MachineAssetLot[];
  technologyLevel: number;
  loanBalance?: number;
  loanAnnualRate?: number;
  loanDueRound?: number;
  productionTargets?: Record<string, number>;
  currentMarketId?: string;
  riceCycleStartRound?: number;
  riceCycleProducedQuantity?: number;
  quizCompletedRounds?: number[];
  studentMembers?: StudentMember[];
  status: 'ACTIVE'; createdAt: number; joinedAt: number;
}

export type UpgradeType = 'advancedEquipment' | 'workerTraining' | 'materialEfficiency' | 'ecoProduction';
export interface CompanyUpgrades { advancedEquipment: number; workerTraining: number; materialEfficiency: number; ecoProduction: number; }
export const EMPTY_UPGRADES: CompanyUpgrades = { advancedEquipment: 0, workerTraining: 0, materialEfficiency: 0, ecoProduction: 0 };
export const UPGRADE_OPTIONS: Array<{ id: UpgradeType; name: string; icon: string; description: string }> = [
  { id: 'advancedEquipment', name: '고급 설비', icon: '⚙️', description: '기존 기계 수는 그대로이며, 추가 기계가 한계생산 체감을 완화하는 효과가 단계마다 12% 커집니다.' },
  { id: 'workerTraining', name: '노동자 훈련', icon: '🎓', description: '단계마다 노동자의 기본 생산성이 6% 높아집니다. 기계처럼 한계생산 체감 속도를 바꾸지는 않습니다.' },
  { id: 'materialEfficiency', name: '재료 효율 개선', icon: '♻️', description: '단계마다 제품 1개당 재료비를 5% 줄입니다.' },
  { id: 'ecoProduction', name: '친환경 생산 도입', icon: '🌱', description: '단계마다 재료비를 2% 줄이고, 친환경 선호 증가 사건 때 같은 가격 기업보다 더 많은 수요를 배분받습니다.' },
];

export interface MachineAssetLot {
  id: string;
  marketId: string;
  quantity: number;
  purchasePrice: number;
  purchasedRound: number;
  lastRepairedRound?: number;
}

export interface ProductionProfile {
  rentPerRound: number;
  wagePerWorker: number;
  materialUnitCost: number;
  firstWorkerProductivity: number;
  productivityDecline: number;
  minimumWorkerProductivity: number;
  machinePrice: number;
  researchBaseCost: number;
  technologyBoostRate: number;
  maxWorkers?: number;
}

export interface Product { id: string; roomId: string; name: string; icon: string; unit: string; baseUnitCost: number; active: boolean; }
export interface InventoryItem { productId: string; productName: string; productIcon: string; quantity: number; averageUnitCost: number; updatedAt: number; }

export interface ProductionPlan {
  id: string; roomId: string; companyId: string; productId: string; marketName: string; announcedPrice: number;
  roundNumber: number; requestedQuantity: number; producedQuantity: number; workerCount: number;
  productionCapacity: number; marginalProduct: number; marginalCost: number | null;
  supplyCurve?: Array<{ quantity: number; marginalCost: number }>;
  rentCost: number; wageCost: number; materialCost: number; policyCost?: number; productionCost: number;
  earlyTerminationCost?: number;
  machinePurchases: number; machineCountAfter: number; researchLevels: number; technologyLevelAfter: number;
  upgradePurchased?: UpgradeType | null;
  upgradeCost?: number;
  upgradesAfter?: CompanyUpgrades;
  machineSales?: number; machineResaleRevenue?: number;
  investmentCost: number; totalCost: number; openingCash: number; spendingLimit: number;
  askingPrice?: number; offeredQuantity?: number; soldQuantity?: number;
  pricePrediction?: 'UP' | 'SAME' | 'DOWN';
  marketPrice?: number | null; revenue?: number; profit?: number;
  operatingProfit?: number; economicProfit?: number; cashFlow?: number;
  depreciationCost?: number; allocatedInvestmentCost?: number;
  machineRepairs?: number; machineRepairCost?: number;
  interestCost?: number;
  riceCycleStage?: 'GROWING' | 'HARVEST';
  riceCycleStartRound?: number;
  landCapacityPerCycle?: number;
  disasterLossQuantity?: number;
  settlementStatus?: 'PENDING' | 'SETTLED';
  status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED'; createdAt: number; confirmedAt?: number;
}

export interface MarketRoundResult {
  id: string;
  roomId: string;
  roundNumber: number;
  marketId: string;
  marketName: string;
  referencePrice: number;
  marketPrice: number | null;
  demandQuantity: number;
  totalSupply: number;
  tradedQuantity: number;
  unsoldQuantity: number;
  participantCount: number;
  totalRevenue: number;
  demandEventTitle?: string;
  settledAt: number;
}

export interface LearningReflection {
  id: string;
  roomId: string;
  companyId: string;
  companyName: string;
  roundNumber: number;
  marginalProductObservation: string;
  marketChangeObservation: string;
  nextStrategy: string;
  submittedAt: number;
}

export interface SellOrder { id: string; roomId: string; companyId: string; companyName: string; productId: string; productName: string; unitPrice: number; initialQuantity: number; remainingQuantity: number; roundNumber: number; status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED'; createdAt: number; updatedAt: number; }
export interface Trade { id: string; roomId: string; orderId: string; buyerCompanyId: string; sellerCompanyId: string; productId: string; productName: string; unitPrice: number; quantity: number; totalPrice: number; roundNumber: number; createdAt: number; }
export interface Round { roundNumber: number; status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'; }
