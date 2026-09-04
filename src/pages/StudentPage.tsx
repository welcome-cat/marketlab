import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FirmSupplyCurve } from '../components/FirmSupplyCurve';
import { ConceptHelp } from '../components/ConceptHelp';
import { StudentRosterEditor } from '../components/StudentRosterEditor';
import { calculateLoanTerms, calculateMachineRepairCost, calculateMarketClearing, calculateMinimumWorkerCount, calculateProductionQuote, companyService, getTechnologyMarketFit, machineDepreciationRate, productionService, reflectionService, roomService, scaleMarketEventFactor } from '../services';
import type { Company, InventoryItem, LearningReflection, Market, ProductionPlan, Room, UpgradeType } from '../types/domain';
import { DEFAULT_REFLECTION_SHEETS, EVENT_INTENSITY_SCALE, INDUSTRY_TRAITS, INITIAL_COMPANY_CASH, UPGRADE_OPTIONS } from '../types/domain';

const STUDENT_SESSION_KEY = 'marketlab:student-session';
const saveSession = (roomId: string, companyName: string) => {
  try { localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({ roomId, companyName })); } catch { /* 현재 접속은 유지 */ }
};
const errorText = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ROOM_NOT_FOUND') return '존재하지 않는 룸 코드입니다.';
  if (code === 'ROOM_NOT_JOINABLE') return '종료된 수업에는 새 회사로 입장할 수 없습니다.';
  if (code === 'INVALID_COMPANY_NAME') return '회사 이름은 1자 이상 30자 이하로 입력해주세요.';
  if (code === 'NEW_COMPANY_MEMBERS_REQUIRED') return '처음 만드는 회사입니다. 이전 화면으로 돌아가 참여 학생의 학번과 이름을 입력해주세요.';
  return '회사 접속 중 오류가 발생했습니다.';
};

const DIAGNOSIS_STARTING_CAPITAL = INITIAL_COMPANY_CASH;
const DIAGNOSIS_HORIZON_ROUNDS = 3;
const getPublicMarketPrice = (market: Market) => market.publicPrice ?? market.basePrice;
const splitAcrossRounds = (quantity: number) => Array.from({ length: DIAGNOSIS_HORIZON_ROUNDS }, (_, index) =>
  Math.floor(quantity / DIAGNOSIS_HORIZON_ROUNDS) + (index < quantity % DIAGNOSIS_HORIZON_ROUNDS ? 1 : 0));

const calculateDiagnosisProjection = (company: Company, market: Market, quantity: number, workerCount: number) => {
  const isRice = market.id === 'market_toy';
  const roundQuantities = isRice ? splitAcrossRounds(quantity) : Array(DIAGNOSIS_HORIZON_ROUNDS).fill(quantity);
  const totalOutput = roundQuantities.reduce((sum, roundQuantity) => sum + roundQuantity, 0);
  let totalEconomicCost = 0;
  let totalCashOutlay = 0;
  let outstandingCash = 0;
  let peakCashRequired = 0;
  let marginalCost = 0;

  roundQuantities.forEach((roundQuantity, index) => {
    const quote = calculateProductionQuote(company, market, roundQuantity, workerCount, 0, null, index === 0, index + 1, 0);
    totalEconomicCost += quote.economicCost;
    totalCashOutlay += quote.netCashCost;
    // 나머지가 앞 라운드에 배분되더라도 실제 3라운드 중 가장 높은 한계비용을 보여준다.
    if (roundQuantity > 0) marginalCost = Math.max(marginalCost, quote.marginalCost || 0);
    // 생산비를 먼저 지급한 뒤 판매대금을 받으므로, 라운드 중 필요한 최대 현금을 따로 계산한다.
    outstandingCash += quote.netCashCost;
    peakCashRequired = Math.max(peakCashRequired, outstandingCash);
    if (!isRice) outstandingCash -= market.announcedPrice * roundQuantity;
    else if (index === DIAGNOSIS_HORIZON_ROUNDS - 1) outstandingCash -= market.announcedPrice * totalOutput;
  });

  const revenue = market.announcedPrice * totalOutput;
  const profit = revenue - totalEconomicCost;
  return {
    totalOutput,
    revenue,
    totalEconomicCost,
    totalCashOutlay,
    peakCashRequired,
    profit,
    averageProfitPerRound: Math.round(profit / DIAGNOSIS_HORIZON_ROUNDS),
    roi: peakCashRequired > 0 ? (profit / peakCashRequired) * 100 : 0,
    averageCost: totalOutput > 0 ? Math.round(totalEconomicCost / totalOutput) : 0,
    marginalCost,
  };
};

const calculateAffordableQuantity = (company: Company, market: Market, workerCount: number) => {
  const perRoundCapacity = calculateProductionQuote(company, market, 1, workerCount).productionCapacity;
  // 쌀 진단 슬라이더는 3라운드 누적 생산량이므로 토지·노동의 라운드별 생산능력도 3회 합산한다.
  const capacity = market.id === 'market_toy' ? perRoundCapacity * DIAGNOSIS_HORIZON_ROUNDS : perRoundCapacity;
  let low = 0;
  let high = capacity;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const projection = calculateDiagnosisProjection(company, market, middle, workerCount);
    if (projection.peakCashRequired <= DIAGNOSIS_STARTING_CAPITAL) low = middle;
    else high = middle - 1;
  }
  return { technicalCapacity: capacity, affordableCapacity: low };
};

const calculateCashLimitedCapacity = (company: Company, market: Market, workerCount: number, machinePurchases: number, upgradePurchase: UpgradeType | null, includeSetupCost: boolean, roundNumber: number, machineSales: number) => {
  const technicalCapacity = calculateProductionQuote(company, market, 1, workerCount, machinePurchases, upgradePurchase, includeSetupCost, roundNumber, machineSales).productionCapacity;
  let low = 0;
  let high = technicalCapacity;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = calculateProductionQuote(company, market, middle, workerCount, machinePurchases, upgradePurchase, includeSetupCost, roundNumber, machineSales);
    if (candidate.netCashCost <= candidate.spendingLimit) low = middle;
    else high = middle - 1;
  }
  return low;
};

export const StudentPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const roomId = params.get('roomId') || '';
  const companyName = params.get('name') || '';
  const readOnly = params.get('readonly') === '1';
  const studentMembersParam = params.get('members') || '';
  const queryError = !roomId || !companyName ? '룸 코드 또는 회사 이름이 누락되었습니다.' : null;
  const [company, setCompany] = useState<Company | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(() => !queryError);
  const [error, setError] = useState<string | null>(() => queryError);
  const [selectedMarketId, setSelectedMarketId] = useState('market_tumbler');
  const [askingPrice, setAskingPrice] = useState(900);
  const [offeredQuantitySelection, setOfferedQuantitySelection] = useState<{ scope: string; quantity: number } | null>(null);
  const [pricePrediction, setPricePrediction] = useState<'UP' | 'SAME' | 'DOWN'>('SAME');
  const [inventory, setInventory] = useState<InventoryItem | null>(null);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [marketPlans, setMarketPlans] = useState<ProductionPlan[]>([]);
  const [allPlans, setAllPlans] = useState<ProductionPlan[]>([]);
  const [roomCompanies, setRoomCompanies] = useState<Company[]>([]);
  const [workerCount, setWorkerCount] = useState(1);
  const [productionQty, setProductionQty] = useState(10);
  const [machinePurchases, setMachinePurchases] = useState(0);
  const [machineSales, setMachineSales] = useState(0);
  const [machineRepairs, setMachineRepairs] = useState(0);
  const [upgradePurchase, setUpgradePurchase] = useState<UpgradeType | null>(null);
  const [loanAmount, setLoanAmount] = useState(10000);
  const [submitting, setSubmitting] = useState(false);
  const [productionConfirmOpen, setProductionConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [showSupplyCurve, setShowSupplyCurve] = useState(true);
  const [showProducerSurplus, setShowProducerSurplus] = useState(false);
  const [clock, setClock] = useState(0);
  const [reflection, setReflection] = useState<LearningReflection | null>(null);
  const [reflectionAnswers, setReflectionAnswers] = useState<Record<string, string>>({});
  const [industryTraitId, setIndustryTraitId] = useState('industry_service');
  const [diagnosisWorkers, setDiagnosisWorkers] = useState(10);
  const [diagnosisQuantities, setDiagnosisQuantities] = useState<Record<string, number>>({});
  const companyId = company?.id;
  const currentRound = room?.currentRound;
  const observedRound = useRef<number | null>(null);
  const marketPanelRef = useRef<HTMLDetailsElement | null>(null);
  const diagnosisPanelRef = useRef<HTMLDetailsElement | null>(null);
  const sellingPanelRef = useRef<HTMLElement | null>(null);
  const sellingScrollKey = useRef('');

  useEffect(() => {
    if (!roomId || !companyName) return;
    let studentMembers: Array<{ studentNumber: string; name: string }> = [];
    try { studentMembers = JSON.parse(studentMembersParam || '[]'); } catch { /* 잘못된 명단 값은 무시 */ }
    let mounted = true;
    companyService.registerCompany(roomId, companyName, studentMembers).then((value) => {
      if (!mounted) return;
      saveSession(roomId, value.name); setCompany(value); if (value.currentMarketId) setSelectedMarketId(value.currentMarketId); setWorkerCount(value.employeeCount || 1); setLoading(false);
    }).catch((reason) => { if (mounted) { setError(errorText(reason)); setLoading(false); } });
    const unsubscribe = roomService.subscribeRoom(roomId, (value) => {
      if (!mounted || !value) return;
      if (observedRound.current !== null && observedRound.current !== value.currentRound) {
        setMachinePurchases(0);
        setMachineSales(0);
        setUpgradePurchase(null);
        setProductionQty(10);
        setMessage(null);
        setReflection(null);
        setReflectionAnswers({});
      }
      observedRound.current = value.currentRound;
      setRoom(value);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [roomId, companyName, studentMembersParam]);

  useEffect(() => {
    if (!companyId) return;
    return companyService.subscribeCompany(roomId, companyId, (value) => {
      if (value) { setCompany(value); if (value.currentMarketId) setSelectedMarketId(value.currentMarketId); }
      else { setCompany(null); setError('교사가 이 기업을 삭제했습니다.'); }
    });
  }, [roomId, companyId]);

  useEffect(() => {
    if (!companyId) return;
    return companyService.subscribeCompanies(roomId, setRoomCompanies);
  }, [roomId, companyId]);

  useEffect(() => productionService.subscribeAllProductionPlans(roomId, setAllPlans), [roomId]);

  useEffect(() => {
    if (!companyId || currentRound === undefined) return;
    return productionService.subscribeProductionPlan(roomId, companyId, currentRound, (value) => {
      setPlan(value);
      if (value?.askingPrice) setAskingPrice(value.askingPrice);
      if (value?.pricePrediction) setPricePrediction(value.pricePrediction);
    });
  }, [roomId, companyId, currentRound]);

  useEffect(() => {
    // 새 라운드의 시장 선택은 먼저 보여주고, 생산 결정을 확정하면 자동으로 접는다.
    if (marketPanelRef.current) marketPanelRef.current.open = !plan;
  }, [companyId, currentRound, plan]);

  useEffect(() => {
    // 새 회사는 진단부터 진행한다. 기존 회사의 진단서는 수업 시작과 함께 접되 다시 펼칠 수 있다.
    if (diagnosisPanelRef.current) diagnosisPanelRef.current.open = company?.traitsConfirmed === false || room?.status === 'WAITING';
  }, [company?.traitsConfirmed, room?.status]);

  useEffect(() => {
    if (currentRound === undefined) return;
    return productionService.subscribeRoundProductionPlans(roomId, currentRound, setMarketPlans);
  }, [roomId, currentRound]);

  useEffect(() => { if (room?.roundPhase !== 'SELLING') return; const timer = window.setInterval(() => setClock(Date.now()), 500); return () => window.clearInterval(timer); }, [room?.roundPhase]);
  useEffect(() => {
    if (!room || room.roundPhase !== 'SELLING' || !plan) return;
    const key = `${room.id}:${room.currentRound}`;
    if (sellingScrollKey.current === key) return;
    sellingScrollKey.current = key;
    window.setTimeout(() => sellingPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }, [room, plan]);
  useEffect(() => {
    if (!companyId) return;
    return productionService.subscribeInventory(roomId, companyId, selectedMarketId, setInventory);
  }, [roomId, companyId, selectedMarketId]);

  useEffect(() => {
    if (!companyId || currentRound === undefined) return;
    return reflectionService.subscribeCompanyRound(roomId, companyId, currentRound, setReflection);
  }, [roomId, companyId, currentRound]);

  if (loading) return <div style={{ padding: '80px', textAlign: 'center' }}>🏢 회사 정보를 불러오는 중...</div>;
  if (error || !company || !room) return <div style={{ padding: '80px 20px', textAlign: 'center' }}><h2>⚠️ 접속 오류</h2><p>{error || '룸 정보를 불러오지 못했습니다.'}</p><button onClick={() => navigate('/')}>홈으로</button></div>;

  const scheduledQuizId = room.quizSchedule?.[String(room.currentRound)];
  const currentQuiz = scheduledQuizId ? room.economicsQuizzes.find((quiz) => quiz.id === scheduledQuizId) : undefined;
  const reflectionInterval = room.reflectionInterval || 3;
  const reflectionSheets = room.reflectionSheets?.length ? room.reflectionSheets : DEFAULT_REFLECTION_SHEETS;
  const reflectionDue = room.currentRound % reflectionInterval === 0;
  const currentReflectionSheet = reflectionSheets[(Math.floor(room.currentRound / reflectionInterval) - 1) % reflectionSheets.length];
  const selectedMarket = room.markets.find((market) => market.id === (plan?.productId || selectedMarketId)) || room.markets[0];
  const publicReferencePrice = getPublicMarketPrice(selectedMarket);
  const publicPriceLabel = room.currentRound === 1 || !selectedMarket.publicPriceRound ? '초기 기준가격' : `Round ${selectedMarket.publicPriceRound} 거래가격`;
  const minimumWorkerCount = calculateMinimumWorkerCount(company, room.currentRound);
  const quantityUnit = selectedMarket.id === 'market_toy' ? 'kg' : '개';
  const isRiceMarket = selectedMarket.id === 'market_toy';
  const riceCycleStartRound = room.currentRound - ((room.currentRound - 1) % selectedMarket.productionCycleRounds);
  const riceCycleProduced = isRiceMarket && company.riceCycleStartRound === riceCycleStartRound ? company.riceCycleProducedQuantity || 0 : 0;
  const riceLandCapacity = selectedMarket.landCapacityPerCycle || Number.POSITIVE_INFINITY;
  const riceLandRemaining = isRiceMarket ? riceLandCapacity : Number.POSITIVE_INFINITY;
  const isRiceHarvestRound = isRiceMarket && room.currentRound % selectedMarket.productionCycleRounds === 0;
  const plannedProductionQty = isRiceMarket ? Math.min(productionQty, riceLandRemaining) : productionQty;
  const sellableMachineCount = (company.machineAssets || []).filter((asset) => asset.marketId === selectedMarket.id && asset.purchasedRound < room.currentRound).reduce((sum, asset) => sum + asset.quantity, 0);
  const quote = calculateProductionQuote(company, selectedMarket, plannedProductionQty, workerCount, machinePurchases, upgradePurchase, !inventory, room.currentRound, machineSales, machineRepairs);
  const repairableMachines = (company.machineAssets || []).filter((asset) => asset.marketId === selectedMarket.id && asset.purchasedRound < room.currentRound && machineDepreciationRate(asset, room.currentRound) > 0).reduce((sum, asset) => sum + asset.quantity, 0);
  const cashLimitedCapacity = Math.min(calculateCashLimitedCapacity(company, selectedMarket, workerCount, machinePurchases, upgradePurchase, !inventory, room.currentRound, machineSales), riceLandRemaining);
  let cashLimitedWorkerCount = minimumWorkerCount;
  for (let candidateWorkers = minimumWorkerCount; candidateWorkers <= 100; candidateWorkers += 1) {
    const candidateCapacity = calculateCashLimitedCapacity(company, selectedMarket, candidateWorkers, machinePurchases, upgradePurchase, !inventory, room.currentRound, machineSales);
    const candidateQuote = calculateProductionQuote(company, selectedMarket, Math.max(1, Math.min(plannedProductionQty, candidateCapacity)), candidateWorkers, machinePurchases, upgradePurchase, !inventory, room.currentRound, machineSales);
    if (candidateCapacity < 1 || candidateQuote.currentMarginalProduct <= 0 || candidateQuote.netCashCost > candidateQuote.spendingLimit) break;
    cashLimitedWorkerCount = candidateWorkers;
  }
  const remainingBudget = quote.spendingLimit - quote.netCashCost;
  const effectivePrice = askingPrice;
  const maximumSellableQuantity = isRiceMarket && !isRiceHarvestRound ? 0 : (inventory?.quantity || 0) + plannedProductionQty;
  const offeredQuantityScope = `${company.id}:${room.currentRound}:${selectedMarket.id}`;
  const desiredOfferedQuantity = plan
    ? plan.offeredQuantity ?? plan.producedQuantity
    : Math.min(maximumSellableQuantity, offeredQuantitySelection?.scope === offeredQuantityScope ? offeredQuantitySelection.quantity : maximumSellableQuantity);
  const expectedRevenue = effectivePrice * desiredOfferedQuantity;
  const selectedMarketParticipants = new Set(marketPlans.filter((item) => item.productId === selectedMarket.id).map((item) => item.companyId)).size;
  const expectedOperatingProfit = expectedRevenue - quote.productionCost;
  const expectedEconomicProfit = expectedRevenue - quote.economicCost;
  const expectedCashFlow = expectedRevenue + quote.machineResaleRevenue - quote.totalCost;
  const isRunning = room.status === 'RUNNING';
  const isDecision = isRunning && room.roundPhase === 'DECISION';
  const canChooseMarket = room.status !== 'FINISHED' && room.roundPhase === 'DECISION' && !plan;
  const traitSelectionOpen = room.roundPhase === 'DECISION' && room.status !== 'FINISHED';
  const canConfirm = isDecision && !plan && !submitting && company.traitsConfirmed !== false && (!company.currentMarketId || company.currentMarketId === selectedMarket.id) && (plannedProductionQty > 0 || isRiceMarket) && workerCount >= 1 && workerCount <= cashLimitedWorkerCount && quote.currentMarginalProduct > 0 && plannedProductionQty <= cashLimitedCapacity && remainingBudget >= 0 && quote.machineCountAfter <= selectedMarket.maxMachines;
  const marginalCostLabel = quote.marginalCost === null ? '생산 불가' : `${quote.marginalCost.toLocaleString()}원/개`;
  const newspaperEvents = room.pendingDemandEvents.length > 0 ? room.pendingDemandEvents : room.demandEvents;
  const newspaperRound = room.pendingDemandEvents.length > 0 && room.status === 'RUNNING' ? room.currentRound + 1 : room.currentRound;
  const sellingProgress = room.roundPhase === 'SELLING' ? Math.max(0, Math.min(1, (clock - (room.sellingStartedAt || clock)) / 30000)) : 0;
  const sellingMonth = Math.min(4, Math.max(1, Math.ceil(sellingProgress * 4)));
  const selectedDemandEvent = room.demandEvents.find((event) => event.marketId === selectedMarket.id);
  const selectedDemandMultiplier = selectedDemandEvent?.effectType === 'SUPPLY' ? 1 : scaleMarketEventFactor(selectedDemandEvent?.multiplier, EVENT_INTENSITY_SCALE[selectedDemandEvent?.demandIntensity || 'MEDIUM']);
  const selectedClearing = calculateMarketClearing(selectedMarket, marketPlans.filter((item) => item.productId === selectedMarket.id), selectedDemandMultiplier);
  const loanTerms = calculateLoanTerms(company, inventory ? [inventory] : [], room.currentRound);
  const projectedSoldQuantity = plan ? selectedClearing.soldByPlan.get(plan.id) || 0 : 0;
  const plannedSaleQuantity = plan ? plan.offeredQuantity ?? plan.producedQuantity : 0;
  const currentSalePrice = plan?.askingPrice || plan?.announcedPrice || publicReferencePrice;
  const referenceSalePrice = publicReferencePrice;
  const priceGapRate = (referenceSalePrice - currentSalePrice) / Math.max(1, referenceSalePrice);
  // 30초를 4개월로 압축해 보여주는 교육용 판매 속도입니다. 최종 판매량은 실제
  // 수요·공급 매칭값을 따르고, 가격 차이는 그 물량이 팔리는 속도에만 반영합니다.
  const salesPace = priceGapRate >= 0 ? 1 + Math.min(0.8, priceGapRate * 2) : Math.max(0.25, 1 + priceGapRate * 2);
  const liveSoldQuantity = Math.min(projectedSoldQuantity, Math.floor(projectedSoldQuantity * Math.min(1, sellingProgress * salesPace)));
  const projectedSellThrough = plan ? projectedSoldQuantity / Math.max(1, plannedSaleQuantity) : 0;
  const saleAnalysis = projectedSoldQuantity === 0
    ? '아직 판매되지 않았습니다. 신문과 다른 기업의 움직임을 참고해 희망가격을 조정해보세요.'
    : projectedSellThrough < 1
      ? '일부만 판매되고 있습니다. 희망가격을 조정하거나 남은 물량을 재고로 보유할 수 있습니다.'
      : '희망한 판매 물량이 모두 판매될 것으로 예상됩니다.';
  const predictionMinimumPrice = Math.max(100, Math.round(publicReferencePrice * (pricePrediction === 'DOWN' ? 0.7 : pricePrediction === 'SAME' ? 0.95 : 1)));
  const predictionMaximumPrice = Math.round(publicReferencePrice * (pricePrediction === 'UP' ? 1.3 : pricePrediction === 'SAME' ? 1.05 : 1));
  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 22px' } as const;

  const changePricePrediction = (nextPrediction: 'UP' | 'SAME' | 'DOWN') => {
    const minimum = Math.max(100, Math.round(publicReferencePrice * (nextPrediction === 'DOWN' ? 0.7 : nextPrediction === 'SAME' ? 0.95 : 1)));
    const maximum = Math.round(publicReferencePrice * (nextPrediction === 'UP' ? 1.3 : nextPrediction === 'SAME' ? 1.05 : 1));
    setPricePrediction(nextPrediction);
    setAskingPrice((price) => Math.max(minimum, Math.min(maximum, price)));
  };

  const submitProduction = async () => {
    if (!canConfirm) return;
    try {
      setSubmitting(true); setMessage(null);
      await productionService.confirmProduction({ roomId, companyId: company.id, marketId: selectedMarket.id, requestedQuantity: plannedProductionQty, workerCount, machinePurchases, machineSales, machineRepairs, upgradePurchase, askingPrice, offeredQuantity: desiredOfferedQuantity, pricePrediction });
      setProductionConfirmOpen(false);
      setMessage('생산 결정이 제출되었습니다. 시장가격에 따른 거래 실행을 기다려주세요.');
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      const messages: Record<string, string> = {
        PRODUCTION_ALREADY_CONFIRMED: '이번 라운드의 결정은 이미 확정되었습니다.',
        PRODUCTION_CAPACITY_EXCEEDED: '선택한 노동·기계·기술로 생산할 수 있는 양을 넘었습니다.',
        SPENDING_LIMIT_EXCEEDED: '보유 자본금을 넘게 지출할 수 없습니다.',
        INVALID_WORKER_COUNT: '마지막 노동자의 한계생산이 0입니다. 노동자 수를 줄이거나 기계를 추가해주세요.',
        WORKER_REDUCTION_NOT_ALLOWED: '새로 고용한 노동자는 다음 라운드까지 유지해야 합니다.',
        INVALID_MACHINE_SALE: '이번 라운드에 매각할 수 있는 기계 수를 확인해주세요.',
        ROOM_NOT_RUNNING: '교사가 라운드를 시작한 뒤 생산할 수 있습니다.',
        ROUND_DECISION_CLOSED: '기업 선택이 마감되어 더 이상 제출할 수 없습니다.',
        FACILITY_LIMIT_EXCEEDED: `이 시장에는 기계를 최대 ${selectedMarket.maxMachines}대까지 설치할 수 있습니다.`,
        MACHINE_PURCHASE_LIMIT: '기계는 한 라운드에 최대 1대만 구입할 수 있습니다.',
        LAND_CAPACITY_EXCEEDED: `이번 재배 주기의 농지 한도 ${Number.isFinite(riceLandCapacity) ? riceLandCapacity : 0}kg을 초과했습니다.`,
        OFFERED_QUANTITY_EXCEEDED: '판매 희망 수량은 현재 재고와 이번 생산량의 합계를 넘을 수 없습니다.',
        MACHINE_FEATURE_LOCKED: `기계 투자 기능은 Round ${room.unlockRounds.machines}부터 사용할 수 있습니다.`,
        UPGRADE_FEATURE_LOCKED: '선택한 업그레이드는 교사가 설정한 라운드부터 사용할 수 있습니다.',
        UPGRADE_ALREADY_PURCHASED: '이번 라운드에는 이미 업그레이드를 적용했습니다.',
        UPGRADE_MAX_LEVEL: '해당 업그레이드는 최대 3단계입니다.',
        COMPANY_TRAITS_REQUIRED: '먼저 기업 진단서에서 업종 경험과 생산방식을 확정해주세요.',
      };
      setMessage(messages[code] || '생산 확정 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
  };

  const confirmProduction = () => {
    if (!canConfirm) return;
    setAskingPrice((price) => Math.max(predictionMinimumPrice, Math.min(predictionMaximumPrice, price)));
    setProductionConfirmOpen(true);
  };

  const borrowMoney = async () => {
    try { await productionService.borrow(roomId, company.id, Math.floor(loanAmount)); setMessage(`${Math.floor(loanAmount).toLocaleString()}원을 대출받았습니다.`); }
    catch (reason) { setMessage(reason instanceof Error && reason.message === 'LOAN_LIMIT_EXCEEDED' ? '대출 가능 한도를 초과했습니다.' : '대출을 실행하지 못했습니다.'); }
  };

  const repayLoan = async () => {
    try { await productionService.repayLoan(roomId, company.id, Math.floor(loanAmount)); setMessage(`${Math.floor(loanAmount).toLocaleString()}원의 대출 원금을 상환했습니다.`); }
    catch { setMessage('상환액이 대출잔액 또는 보유현금을 초과했습니다.'); }
  };

  const logout = () => { try { localStorage.removeItem(STUDENT_SESSION_KEY); } catch { /* 이동 계속 */ } navigate('/', { replace: true }); };
  const answerQuiz = async (choice: number) => {
    if (!currentQuiz) return;
    if (choice !== currentQuiz.answer) return setMessage('아쉽습니다. 개념을 다시 생각하고 다른 답을 골라보세요.');
    try { await companyService.awardQuiz(roomId, company.id, room.currentRound, currentQuiz.reward); setQuizOpen(false); setMessage(`정답입니다! 운영자금 ${currentQuiz.reward.toLocaleString()}원을 확보했습니다.`); }
    catch { setMessage('이번 라운드의 퀴즈 보상은 이미 받았습니다.'); }
  };
  const applyAskingPrice = async (nextPrice = askingPrice) => { if (!plan) return; const bounded = Math.max(predictionMinimumPrice, Math.min(predictionMaximumPrice, nextPrice)); setAskingPrice(bounded); try { await productionService.updateAskingPrice(roomId, company.id, room.currentRound, bounded); setMessage('변경한 가격이 즉시 판매에 반영되었습니다.'); } catch (reason) { setMessage(reason instanceof Error && reason.message === 'PRICE_OUT_OF_RANGE' ? '선택한 예측 방향의 허용 범위 안에서만 가격을 조정할 수 있습니다.' : '30초 판매시간이 끝나 가격을 변경할 수 없습니다.'); } };
  const submitReflection = async () => {
    const answers = currentReflectionSheet.questions.map((question) => ({ questionId: question.id, question: question.prompt, answer: (reflectionAnswers[question.id] || '').trim() }));
    if (answers.some((answer) => !answer.answer)) return setMessage('활동지의 모든 문항을 작성해주세요.');
    await reflectionService.save({ roomId, companyId: company.id, companyName: company.name, roundNumber: room.currentRound, sheetId: currentReflectionSheet.id, sheetTitle: currentReflectionSheet.title, answers, marginalProductObservation: answers[0]?.answer || '', marketChangeObservation: answers[1]?.answer || '', nextStrategy: answers[2]?.answer || '' });
    setMessage('경제 활동지가 제출되었습니다.');
  };
  const confirmTraits = async () => {
    try {
      setSubmitting(true);
      await companyService.selectIndustryTrait(roomId, company.id, industryTraitId);
      setMessage('기업 특성이 확정되었습니다. 모의생산으로 비교우위를 확인해보세요.');
    } catch { setMessage('기업 특성을 확정하지 못했습니다. 현재 기업 선택 시간이 열려 있는지 확인해주세요.'); }
    finally { setSubmitting(false); }
  };

  const purchaseIndustryChange = async () => {
    if (!window.confirm('15,000원을 내고 새 업종 경험을 취득할까요? 기존 경험은 교체됩니다.')) return;
    try { setSubmitting(true); await companyService.changeIndustryTrait(roomId, company.id, industryTraitId); setMessage('신규 사업 준비를 마쳐 업종 경험이 변경되었습니다.'); }
    catch (reason) { setMessage(reason instanceof Error && reason.message === 'INSUFFICIENT_CASH' ? '업종 전환비 15,000원이 부족합니다.' : '업종 경험을 변경하지 못했습니다.'); }
    finally { setSubmitting(false); }
  };

  const settleMarketExit = async () => {
    if (!company.currentMarketId) return;
    const oldMarket = room.markets.find((market) => market.id === company.currentMarketId);
    if (!window.confirm(`${oldMarket?.name || '기존 시장'}에서 퇴거할까요? 전용 기계는 감가된 중고가격, 재고는 장부가의 50%로 처분됩니다.`)) return;
    try { setSubmitting(true); const recovery = await companyService.exitMarket(roomId, company.id, company.currentMarketId); setMessage(`시장 퇴거 정산으로 ${recovery.toLocaleString()}원을 회수했습니다.`); }
    catch { setMessage('현재는 시장에서 퇴거할 수 없습니다. 생산 결정 시간을 확인해주세요.'); }
    finally { setSubmitting(false); }
  };

  const latestSettledRound = allPlans.reduce((latest, item) => item.settlementStatus === 'SETTLED' ? Math.max(latest, item.roundNumber) : latest, 0);
  const profitRanking = roomCompanies.map((item) => {
    const companyPlans = allPlans.filter((candidate) => candidate.companyId === item.id && candidate.settlementStatus === 'SETTLED');
    return {
      id: item.id,
      name: item.name,
      latestProfit: companyPlans.filter((candidate) => candidate.roundNumber === latestSettledRound).reduce((sum, candidate) => sum + (candidate.economicProfit ?? candidate.profit ?? 0), 0),
      cumulativeProfit: companyPlans.reduce((sum, candidate) => sum + (candidate.economicProfit ?? candidate.profit ?? 0), 0),
      marketName: companyPlans.find((candidate) => candidate.roundNumber === latestSettledRound)?.marketName || '-',
    };
  }).sort((a, b) => b.latestProfit - a.latestProfit);

  return <div className={`student-page${readOnly ? ' student-readonly' : ''}`} style={{ minHeight: '100vh', background: '#f8fafc' }}>
    {readOnly && <div className="teacher-readonly-banner">👁️ 교사용 읽기 전용 화면 — 학생의 선택을 수정할 수 없습니다.</div>}
    {productionConfirmOpen && <div className="confirmation-backdrop" role="presentation">
      <section className="production-confirmation" role="dialog" aria-modal="true" aria-labelledby="production-confirmation-title">
        <h2 id="production-confirmation-title">생산·가격예측 최종 확인</h2>
        <p>가격 방향을 다시 검토하고 필요하면 이 창에서 바로 변경하세요.</p>
        <div className="confirmation-summary"><span>시장 <b>{selectedMarket.icon} {selectedMarket.name}</b></span><span>고용 <b>{workerCount}명</b></span><span>생산량 <b>{plannedProductionQty.toLocaleString()}{quantityUnit}</b></span><span>최대 판매 <b>{desiredOfferedQuantity.toLocaleString()}{quantityUnit}</b></span><span>{publicPriceLabel} <b>{publicReferencePrice.toLocaleString()}원</b></span></div>
        <label>가격 방향 예측<select value={pricePrediction} onChange={(event) => changePricePrediction(event.target.value as 'UP' | 'SAME' | 'DOWN')}><option value="UP">상승</option><option value="SAME">유지</option><option value="DOWN">하락</option></select></label>
        <label>{selectedMarket.priceControl === 'MARKET_PRICE' ? '최저 판매 희망가격' : '우리 기업 판매가격'}<input type="number" min={predictionMinimumPrice} max={predictionMaximumPrice} step="10" value={askingPrice} onChange={(event) => setAskingPrice(Math.max(predictionMinimumPrice, Math.min(predictionMaximumPrice, Number(event.target.value) || predictionMinimumPrice)))} /><small>허용 범위 {predictionMinimumPrice.toLocaleString()}~{predictionMaximumPrice.toLocaleString()}원</small></label>
        <label>최대 판매 희망 수량<input type="number" min="0" max={maximumSellableQuantity} step="1" value={desiredOfferedQuantity} disabled={maximumSellableQuantity === 0} onChange={(event) => setOfferedQuantitySelection({ scope: offeredQuantityScope, quantity: Math.max(0, Math.min(maximumSellableQuantity, Math.floor(Number(event.target.value) || 0))) })} /></label>
        <p className="confirmation-question">가격 방향 예측을 ‘{pricePrediction === 'UP' ? '상승' : pricePrediction === 'DOWN' ? '하락' : '유지'}’, 희망가격을 {askingPrice.toLocaleString()}원으로 확정하시겠습니까?</p>
        <div className="confirmation-actions"><button type="button" onClick={() => setProductionConfirmOpen(false)} disabled={submitting}>돌아가서 수정</button><button type="button" onClick={submitProduction} disabled={submitting}>{submitting ? '확정 중...' : '예측과 생산 결정 확정'}</button></div>
      </section>
    </div>}
    {rosterOpen ? <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="student-roster-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setRosterOpen(false); }}><section className="teacher-company-status-modal" style={{ ...card, border: '2px solid #2563eb' }}><div className="teacher-modal-heading"><h3 id="student-roster-title" style={{ margin: 0 }}>👥 {company.name} 참여 학생</h3><button type="button" onClick={() => setRosterOpen(false)} aria-label="학생 명단 닫기">✕</button></div><p style={{ color: '#64748b' }}>새로 합류한 학생을 추가하거나 기존 학생의 학번·이름을 수정할 수 있습니다.</p><StudentRosterEditor key={`${company.id}:${company.studentMembers?.length || 0}`} initialMembers={company.studentMembers || []} onSave={(members) => companyService.updateStudentMembers(roomId, company.id, members)} onClose={() => setRosterOpen(false)} /></section></div> : null}
    <main className="student-dashboard">
    <section className="student-company" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><div><small style={{ color: '#64748b' }}>룸 {room.id} · {room.title}</small><h1 style={{ margin: '3px 0' }}>🏢 {company.name}</h1></div><div style={{ display: 'flex', gap: '7px' }}><button type="button" onClick={() => setRosterOpen(true)} style={{ height: '34px' }}>👥 회사 인원 보기</button><button onClick={logout} style={{ height: '34px' }}>로그아웃</button></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '14px' }}>
        <div><small>보유 자본금</small><strong style={{ display: 'block', color: '#059669' }}>{company.cash.toLocaleString()}원</strong></div>
        <div><small>보유 기계</small><strong style={{ display: 'block' }}>{company.machineCount || 1}대</strong></div>
        <div><small>기업 업그레이드</small><strong style={{ display: 'block' }}>총 Lv.{Object.values(company.upgrades || {}).reduce((sum, level) => sum + level, 0)}</strong></div>
      </div>
    </section>

    <section className="student-round" style={{ ...card, border: `1px solid ${isRunning ? '#86efac' : '#fde68a'}`, background: isRunning ? '#f0fdf4' : '#fffbeb' }}>
      <strong>{room.status === 'WAITING' ? '⏳ 교사가 수업을 시작하기 전입니다.' : room.status === 'FINISHED' ? '🏁 수업이 종료되었습니다.' : room.roundPhase === 'RESULT' ? `📊 Round ${room.currentRound} 거래 결과` : room.roundPhase === 'SELLING' ? `🛒 Round ${room.currentRound} 판매 ${sellingMonth}개월 차 / 4개월` : room.roundPhase === 'SETTLING' ? `⏳ Round ${room.currentRound} 거래 계산 중` : `▶ Round ${room.currentRound} 기업 선택 중`}</strong>
      <span style={{ display: 'block', fontSize: '13px', color: '#64748b', marginTop: '4px' }}>1라운드는 4개월입니다. 카페·운동화·스마트폰은 매 라운드 판매하고, 쌀은 3라운드 동안 재배한 뒤 주기 마지막에 수확·판매합니다.</span>
      {currentQuiz ? <><button className="quiz-reward-button" type="button" disabled={(company.quizCompletedRounds || []).includes(room.currentRound)} onClick={() => setQuizOpen((open) => !open)}>{(company.quizCompletedRounds || []).includes(room.currentRound) ? '✅ 이번 라운드 퀴즈 완료' : '💰 경제 퀴즈로 현금 확보'}</button>{quizOpen && <div style={{ marginTop: '10px', padding: '12px', background: '#fff', borderRadius: '10px' }}><strong>{currentQuiz.question}</strong><div style={{ display: 'flex', gap: '7px', marginTop: '8px', flexWrap: 'wrap' }}>{currentQuiz.choices.map((choice, index) => <button type="button" key={`${currentQuiz.id}-${index}`} onClick={() => answerQuiz(index)}>{choice}</button>)}</div><small style={{ display: 'block', marginTop: '6px', color: '#64748b' }}>정답 보상 {currentQuiz.reward.toLocaleString()}원 · 라운드당 1회</small></div>}</> : <small style={{ display: 'block', marginTop: '12px', color: '#64748b' }}>이번 라운드에는 경제 퀴즈가 없습니다.</small>}
    </section>

    <details className="student-news" style={{ ...card, border: '2px solid #d97706', background: '#fffbeb' }}>
      <summary style={{ cursor: 'pointer' }}><div style={{ display: 'inline-flex', width: 'calc(100% - 20px)', justifyContent: 'space-between', gap: '10px', alignItems: 'center', verticalAlign: 'middle' }}><div><small style={{ color: '#92400e', fontWeight: 900 }}>MARKETLAB ECONOMY</small><h2 style={{ margin: '3px 0', fontFamily: 'Georgia, serif' }}>📰 Round {newspaperRound} 시장 신문</h2></div><span style={{ color: '#92400e', fontSize: '12px' }}>눌러서 기사 확대·축소</span></div></summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '12px', marginTop: '13px' }}>{newspaperEvents.map((event) => { const market = room.markets.find((item) => item.id === event.marketId); return <article key={event.marketId} style={{ padding: '15px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px' }}><small style={{ color: '#64748b', fontWeight: 800 }}>{market?.icon} {market?.name}</small><section className="news-section"><b>🛒 소비자 리포트</b><h3 style={{ margin: '7px 0', fontSize: '17px', fontFamily: 'Georgia, serif' }}>{event.articleHeadline}</h3><p style={{ margin: 0, lineHeight: 1.65, color: '#334155', fontSize: '13px' }}>{event.articleBody}</p></section><section className="news-section"><b>🏭 생산 동향</b><h3 style={{ margin: '7px 0', fontSize: '17px', fontFamily: 'Georgia, serif' }}>{event.supplyArticleHeadline || `${market?.name || '시장'} 생산 현장, 평소 흐름 이어져`}</h3><p style={{ margin: 0, lineHeight: 1.65, color: '#334155', fontSize: '13px' }}>{event.supplyArticleBody || event.supplyDescription || '생산과 출하 현장에서는 뚜렷한 변화가 관찰되지 않고 있다.'}</p></section></article>; })}</div>
    </details>

    <details ref={diagnosisPanelRef} className="student-diagnosis" style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa', gridColumn: '1 / -1' }}>
      <summary style={{ cursor: 'pointer' }}><h2 style={{ display: 'inline', margin: 0, fontSize: '18px' }}>🔎 생산 시작 전 우리 기업 진단서</h2><small style={{ marginLeft: '9px', color: '#0f766e' }}>눌러서 확대·축소</small></summary>
      {!company.traitsConfirmed ? <div>
        <p style={{ color: '#475569', fontSize: '13px' }}>우리 기업이 시작부터 가진 업종 경험을 선택하세요. 고급 설비·훈련·재료 개선·친환경 생산은 이후 기업을 운영하며 투자합니다. 스마트폰에는 초기 업종 경험 보정이 없습니다.</p>
        <div>
          <fieldset style={{ border: '1px solid #99f6e4', borderRadius: '10px' }}><legend><strong>① 업종별 경험</strong></legend>{INDUSTRY_TRAITS.map((trait) => <label key={trait.id} style={{ display: 'block', padding: '7px' }}><input type="radio" name="industry-trait" checked={industryTraitId === trait.id} onChange={() => setIndustryTraitId(trait.id)} /> {trait.icon} <strong>{trait.name}</strong><small style={{ display: 'block', marginLeft: '22px', color: '#64748b' }}>{trait.description}</small></label>)}</fieldset>
        </div>
        <button onClick={confirmTraits} disabled={submitting || !traitSelectionOpen} style={{ width: '100%', marginTop: '12px', padding: '11px', background: '#0f766e', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>기업 특성 확정</button>
      </div> : <div>
        <p style={{ color: '#475569', fontSize: '13px' }}>{company.industryTraitIcon} <strong>{company.industryTraitName}</strong>. 모든 시장에 실제 신규 기업과 같은 최초 자본금 <strong>{DIAGNOSIS_STARTING_CAPITAL.toLocaleString()}원</strong>을 적용합니다. 노동자와 생산량을 움직여 자금 안에서 시장별 결과를 비교하세요.</p>
        <label style={{ display: 'block', marginBottom: '12px', fontWeight: 700 }}>모의 노동자 수: {diagnosisWorkers}명<input type="range" min="1" max="30" value={diagnosisWorkers} onChange={(event) => setDiagnosisWorkers(Number(event.target.value))} style={{ width: '100%' }} /><span style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 400 }}><small>1명</small><small>30명</small></span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>{room.markets.map((market) => {
          const diagnosisMarket = { ...market, announcedPrice: getPublicMarketPrice(market) };
          const capacity = calculateAffordableQuantity(company, diagnosisMarket, diagnosisWorkers);
          const simulatedQuantity = Math.min(capacity.affordableCapacity, diagnosisQuantities[market.id] || Math.max(1, Math.round(capacity.affordableCapacity * 0.6)));
          const projection = calculateDiagnosisProjection(company, diagnosisMarket, simulatedQuantity, diagnosisWorkers);
          const fit = getTechnologyMarketFit(company, market);
          const unit = market.id === 'market_toy' ? 'kg' : '개';
          const quantityLabel = market.id === 'market_toy' ? '3라운드 총 모의 생산량' : '라운드당 모의 생산량';
          return <article key={market.id} style={{ padding: '13px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '10px' }}><strong>{market.icon} {market.name}</strong><label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>{quantityLabel} {simulatedQuantity.toLocaleString()}{unit}<input type="range" min={capacity.affordableCapacity > 0 ? 1 : 0} max={Math.max(1, capacity.affordableCapacity)} value={simulatedQuantity} disabled={capacity.affordableCapacity === 0} onChange={(event) => setDiagnosisQuantities((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label><span style={{ display: 'block' }}>기술적 생산 가능량 <b style={{ float: 'right' }}>{capacity.technicalCapacity.toLocaleString()}{unit}</b></span><span style={{ display: 'block', color: '#7c3aed' }}>{Math.round(DIAGNOSIS_STARTING_CAPITAL / 10000)}만원으로 운영 가능 <b style={{ float: 'right' }}>{capacity.affordableCapacity.toLocaleString()}{unit}</b></span><span style={{ display: 'block' }}>최대 필요 현금 <b style={{ float: 'right' }}>{projection.peakCashRequired.toLocaleString()}원</b></span><span style={{ display: 'block' }}>3라운드 예상매출 <b style={{ float: 'right' }}>{projection.revenue.toLocaleString()}원</b></span><span style={{ display: 'block' }}>평균비용 <b style={{ float: 'right' }}>{projection.averageCost.toLocaleString()}원</b></span><span style={{ display: 'block' }}>한계비용 <b style={{ float: 'right' }}>{projection.marginalCost > 0 ? projection.marginalCost.toLocaleString() : '-'}원</b></span><span style={{ display: 'block' }}>3라운드 이윤 <b style={{ float: 'right', color: projection.profit >= 0 ? '#059669' : '#dc2626' }}>{projection.profit.toLocaleString()}원</b></span><span style={{ display: 'block' }}>라운드당 평균이윤 <b style={{ float: 'right', color: projection.averageProfitPerRound >= 0 ? '#059669' : '#dc2626' }}>{projection.averageProfitPerRound.toLocaleString()}원</b></span><span style={{ display: 'block' }}>투자금 대비 이윤률 <b style={{ float: 'right', color: projection.roi >= 0 ? '#059669' : '#dc2626' }}>{projection.roi.toFixed(1)}%</b></span><span style={{ display: 'block', color: market.id === 'market_toy' ? '#b45309' : '#64748b' }}>현금 회수 <b style={{ float: 'right' }}>{market.id === 'market_toy' ? '3라운드 말' : '매 라운드'}</b></span><small style={{ display: 'block', marginTop: '8px', color: '#0f766e' }}>{fit.hint}</small></article>;
        })}</div>
        <p style={{ marginBottom: 0, fontSize: '12px', color: '#64748b' }}>모든 시장을 동일한 3라운드 기간으로 비교합니다. 카페·운동화·스마트폰은 매 라운드 생산·판매하고, 쌀은 3라운드 동안 비용을 부담한 뒤 마지막에 한 번 판매합니다. 모의 이윤은 전량 판매 가정이며 실제 수요·경쟁·미판매 결과에 따라 달라질 수 있습니다.</p>
      </div>}
    </details>

    <details ref={marketPanelRef} className="student-market" style={card}><summary style={{ cursor: 'pointer' }}><h2 style={{ display: 'inline', margin: 0, fontSize: '18px' }}>어떤 시장에 뛰어들 것인가?</h2><small style={{ marginLeft: '9px', color: '#64748b' }}>눌러서 확대·축소</small></summary>
      <p style={{ color: '#64748b', fontSize: '13px' }}>카페·쌀(1포대=10kg)·운동화는 시장거래가격을 기준으로 경쟁합니다. 스마트폰은 가격과 생산량을 직접 결정하는 도전시장입니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '10px' }}>{room.markets.map((market) => {
        const chosen = selectedMarket.id === market.id;
        const visiblePrice = getPublicMarketPrice(market);
        const visiblePriceLabel = room.currentRound === 1 || !market.publicPriceRound ? '초기 기준가격' : `Round ${market.publicPriceRound} 거래가격`;
        return <button type="button" key={market.id} disabled={!canChooseMarket} onClick={() => { setSelectedMarketId(market.id); setAskingPrice(visiblePrice); }} style={{ textAlign: 'left', padding: '14px', borderRadius: '11px', border: chosen ? '2px solid #2563eb' : '1px solid #e2e8f0', background: chosen ? '#eff6ff' : '#fff', cursor: canChooseMarket ? 'pointer' : 'not-allowed' }}>
          <span style={{ fontSize: '25px' }}>{market.icon}</span><strong style={{ display: 'block' }}>{market.name}</strong><b style={{ color: '#dc2626' }}>{visiblePriceLabel} {visiblePrice.toLocaleString()}원</b><small style={{ display: 'block', color: '#475569', marginTop: '4px', fontWeight: 700 }}>우리 기업의 제품 1개당 재료비 {Math.round(market.materialUnitCost * market.materialCostMultiplier * getTechnologyMarketFit(company, market).material).toLocaleString()}원</small>
        </button>;
      })}</div>
      {company.currentMarketId && company.currentMarketId !== selectedMarket.id && <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', borderRadius: '10px', color: '#991b1b' }}><strong>기존 시장 퇴거 정산 필요</strong><p style={{ margin: '5px 0', fontSize: '12px' }}>기존 시장의 전용 기계와 재고를 정산한 뒤 새 시장에 진입합니다.</p><button type="button" onClick={settleMarketExit} disabled={submitting}>기존 시장 퇴거·자산 정산</button></div>}
      {company.traitsConfirmed && <div style={{ marginTop: '12px', padding: '12px', background: '#fff7ed', borderRadius: '10px' }}><strong>신규 시장 진입 준비</strong><p style={{ margin: '5px 0', fontSize: '12px', color: '#9a3412' }}>기존 업종 경험을 유지하면 무료입니다. 다른 비교우위를 원하면 전문인력 영입·교육비 15,000원을 내고 경험을 교체할 수 있습니다.</p><div style={{ display: 'flex', gap: '8px' }}><select value={industryTraitId} onChange={(event) => setIndustryTraitId(event.target.value)} style={{ flex: 1 }}>{INDUSTRY_TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.icon} {trait.name}</option>)}</select><button type="button" disabled={submitting || industryTraitId === company.industryTraitId} onClick={purchaseIndustryChange}>15,000원 내고 변경</button></div></div>}
    </details>

    <div className="student-decision-columns">
    <div className="student-decision-left">
    <section className="student-investment" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>설비와 기술에 투자할 것인가?</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-2px 0 12px', padding: '10px 12px', background: '#eff6ff', borderRadius: '9px', color: '#1e3a8a' }}><span>현재 {selectedMarket.name} 기존 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'}</span><strong>{quote.marketMachineCountBefore}대</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px' }}>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>새 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'} 구입 대수
          <input type="number" min="0" max="2" step="1" value={room.currentRound < room.unlockRounds.machines ? 0 : machinePurchases} disabled={Boolean(plan) || room.currentRound < room.unlockRounds.machines} onChange={(e) => setMachinePurchases(Math.max(0, Math.min(2, Math.floor(Number(e.target.value) || 0))))} style={{ width: '100%', marginTop: '8px', padding: '9px' }} />
          <small>{room.currentRound < room.unlockRounds.machines ? `🔒 Round ${room.unlockRounds.machines}부터 기계 투자가 열립니다.` : `1대 ${selectedMarket.machinePrice.toLocaleString()}원 · 구입 후 ${quote.machineCountAfter}/${selectedMarket.maxMachines}대 · 라운드 임대료 ${quote.rentCost.toLocaleString()}원`}</small>
        </label>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>기존 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'} 매각 대수
          <input type="number" min="0" max={sellableMachineCount} step="1" value={machineSales} disabled={Boolean(plan) || room.currentRound < room.unlockRounds.machines} onChange={(e) => setMachineSales(Math.max(0, Math.min(sellableMachineCount, Math.floor(Number(e.target.value) || 0))))} style={{ width: '100%', marginTop: '8px', padding: '9px' }} />
          <small>매각 가능 {sellableMachineCount}대 · 예상 유입 {quote.machineResaleRevenue.toLocaleString()}원</small>
        </label>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>기계 수리 대수
          <input type="number" min="0" max={repairableMachines} step="1" value={machineRepairs} disabled={Boolean(plan) || room.currentRound < room.unlockRounds.machines} onChange={(e) => setMachineRepairs(Math.max(0, Math.min(repairableMachines, Math.floor(Number(e.target.value) || 0))))} style={{ width: '100%', marginTop: '8px', padding: '9px' }} />
          <small>수리 가능 {repairableMachines}대 · 감가율에 비례한 수리비 {calculateMachineRepairCost(company, selectedMarket.id, machineRepairs, room.currentRound).toLocaleString()}원</small>
        </label>
      </div>
      <div style={{ marginTop: '12px' }}><strong>기업 업그레이드 — 한 라운드에 1개</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '9px', marginTop: '8px' }}>{UPGRADE_OPTIONS.map((option) => { const unlockRound = room.unlockRounds[option.id]; const level = company.upgrades?.[option.id] || 0; const locked = room.currentRound < unlockRound; return <button type="button" key={option.id} disabled={Boolean(plan) || locked || level >= 3} onClick={() => setUpgradePurchase((current) => current === option.id ? null : option.id)} style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', border: upgradePurchase === option.id ? '2px solid #0f766e' : '1px solid #cbd5e1', background: upgradePurchase === option.id ? '#f0fdfa' : '#fff' }}><strong>{option.icon} {option.name} Lv.{level}/3</strong><small style={{ display: 'block', marginTop: '5px', color: '#475569' }}>{option.description}</small><b style={{ display: 'block', marginTop: '6px', color: locked ? '#b45309' : '#0f766e' }}>{locked ? `🔒 Round ${unlockRound} 해금` : level >= 3 ? '최대 단계' : upgradePurchase === option.id ? `선택됨 · 투자비 ${quote.upgradeCost.toLocaleString()}원` : '선택하여 효과·비용 확인'}</b></button>; })}</div></div>
      <p style={{ fontSize: '13px', color: '#475569' }}>선택한 투자는 이번 생산계획부터 적용되고 이후 라운드에도 유지됩니다. 고급 설비는 기계가 여러 대일수록 효과가 커집니다.</p>
    </section>

    <section className="student-production" style={{ ...card, border: '2px solid #2563eb' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>고용과 생산 결정</h2><div className="production-reference-price"><span>{room.currentRound === 1 ? '초기 기준가격' : '이전 라운드 거래가격'}</span><strong>{publicReferencePrice.toLocaleString()}원/{quantityUnit}</strong></div>
      {isRiceMarket && <div style={{ marginBottom: '13px', padding: '12px', borderRadius: '10px', background: isRiceHarvestRound ? '#fef3c7' : '#ecfdf5', color: isRiceHarvestRound ? '#92400e' : '#166534' }}><strong>{isRiceHarvestRound ? '🌾 수확·판매 라운드' : `🌱 재배 ${room.currentRound - riceCycleStartRound + 1}/3라운드`}</strong><small style={{ display: 'block', marginTop: '4px' }}>1포대=10kg · 라운드마다 새로 적용되는 농지 한도 {riceLandCapacity}kg · 이번 주기 누적 생산 {riceCycleProduced}kg{isRiceHarvestRound ? ` · 현재 재배 물량과 이번 생산분을 합쳐 판매합니다.` : ' · 생산물은 주기 마지막 라운드까지 재배됩니다.'}</small></div>}
      <label>총 고용 노동자 수<input type="number" min="1" max={cashLimitedWorkerCount} step="1" value={workerCount} disabled={Boolean(plan)} onChange={(e) => setWorkerCount(Math.max(1, Math.min(cashLimitedWorkerCount, Math.floor(Number(e.target.value) || 1))))} style={{ width: '100%', padding: '10px', marginTop: '6px' }} /><small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>기존 {company.employeeCount || 1}명 · 보호 고용 {minimumWorkerCount}명 · 추가고용 {Math.max(0, workerCount - (company.employeeCount || 1))}명 · 1명당 {selectedMarket.wagePerWorker.toLocaleString()}원 · 총임금 <strong style={{ color: '#7c3aed' }}>{quote.wageCost.toLocaleString()}원</strong>{quote.earlyTerminationCost > 0 && <> · 조기퇴직 보상 <strong style={{ color: '#dc2626' }}>{quote.earlyTerminationCost.toLocaleString()}원</strong></>}</small></label>
      <div className="production-workspace">
        <div className="production-curve-column">
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
            <div style={{ display: 'block', fontSize: '13px', fontWeight: 700 }}>우리 기업의 희망 공급량
              <span style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 34px', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                <button className="supply-step-button" type="button" aria-label="희망 공급량 1단위 감소" disabled={Boolean(plan) || plannedProductionQty <= (isRiceMarket ? 0 : 1)} onClick={() => setProductionQty((current) => Math.max(isRiceMarket ? 0 : 1, current - 1))}>−</button>
                <input aria-label="우리 기업의 희망 공급량" type="range" min={isRiceMarket ? 0 : 1} max={Math.max(isRiceMarket ? 0 : 1, cashLimitedCapacity)} step="1" value={Math.min(plannedProductionQty, Math.max(isRiceMarket ? 0 : 1, cashLimitedCapacity))} disabled={Boolean(plan) || cashLimitedCapacity < (isRiceMarket ? 0 : 1)} onChange={(event) => setProductionQty(Number(event.target.value))} style={{ width: '100%' }} />
                <button className="supply-step-button" type="button" aria-label="희망 공급량 1단위 증가" disabled={Boolean(plan) || plannedProductionQty >= cashLimitedCapacity} onClick={() => setProductionQty((current) => Math.min(cashLimitedCapacity, current + 1))}>＋</button>
              </span>
              <span style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 400 }}><small>{isRiceMarket ? 0 : 1}{quantityUnit}</small><strong style={{ color: '#b45309' }}>{Math.min(plannedProductionQty, cashLimitedCapacity).toLocaleString()}{quantityUnit}</strong><small>{isRiceMarket ? '토지·현금 한도' : '현금 한도'} {cashLimitedCapacity.toLocaleString()}{quantityUnit}</small></span>
            </div>
          </div>
          <div style={{ marginTop: '10px', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
            <div className="curve-toggle-actions"><button type="button" onClick={() => setShowSupplyCurve((value) => !value)} aria-pressed={showSupplyCurve}>{showSupplyCurve ? '📉 공급곡선 숨기기' : '📈 공급곡선 전체보기'}</button><button type="button" onClick={() => setShowProducerSurplus((value) => !value)} aria-pressed={showProducerSurplus}>{showProducerSurplus ? '💰 1개당 판매 이윤 숨기기' : '💰 1개당 판매 이윤 보기'}</button></div>
            <FirmSupplyCurve points={quote.supplyCurve} selectedQuantity={plannedProductionQty} selectedMarginalCost={quote.marginalCost} quantityUnit={quantityUnit} marketPrice={publicReferencePrice} marketPriceLabel={room.currentRound === 1 ? '초기 기준가격' : '이전 라운드 거래가격'} showCurve={showSupplyCurve} showSurplus={showProducerSurplus} />
          </div>
          {plannedProductionQty > cashLimitedCapacity && <p style={{ color: '#dc2626', fontSize: '13px' }}>⚠️ 현재 선택은 보유현금을 초과합니다. 희망 공급량을 현금 한도 안으로 낮춰주세요.</p>}
          {quote.currentMarginalProduct === 0 && <p style={{ color: '#dc2626', fontSize: '13px' }}>⚠️ 자본설비에 비해 노동자가 너무 많아 마지막 노동자의 한계생산이 0입니다. 이 고용량으로는 생산을 확정할 수 없습니다.</p>}
        </div>
        <div className="production-indicators">
          {[['현금으로 생산 가능량', `${cashLimitedCapacity}${quantityUnit}`, null], ['마지막 노동자의 한계생산', `${quote.currentMarginalProduct}개`, '한계생산물'], ['다음 노동자의 한계생산', `${quote.nextMarginalProduct}개`, '한계생산물'], ['현재 한계비용', marginalCostLabel, '한계비용']].map(([label, value, concept]) => <div key={label} style={{ padding: '11px', background: '#f8fafc', borderRadius: '9px' }}><small>{label}{concept && <ConceptHelp concept={concept as '한계생산물' | '한계비용'} />}</small><strong style={{ display: 'block', color: '#1d4ed8' }}>{value}</strong></div>)}
        </div>
      </div>
    </section>
    <section className="student-finance" style={card}><details open={room.currentRound >= room.unlockRounds.loans}><summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '18px' }}>🏦 선택 활동: 은행 대출 {room.currentRound < room.unlockRounds.loans && '🔒'}</summary>{room.currentRound < room.unlockRounds.loans ? <p style={{ color: '#64748b', fontSize: '13px' }}>Round {room.unlockRounds.loans}부터 열립니다. 대출은 생산의 핵심 활동이 아니라 금리 변화가 투자와 공급에 미치는 영향을 살펴보는 확장 기능입니다.</p> : <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '7px', marginTop: '12px', fontSize: '13px' }}><span>인정 자산 <b style={{ float: 'right' }}>{loanTerms.recognizedAssets.toLocaleString()}원</b></span><span>현재 대출잔액 <b style={{ float: 'right' }}>{(company.loanBalance || 0).toLocaleString()}원</b></span><span>추가 대출 가능액 <b style={{ float: 'right' }}>{loanTerms.availableLoan.toLocaleString()}원</b></span><span>적용 연이율 <b style={{ float: 'right' }}>{(company.loanAnnualRate || loanTerms.annualRate).toFixed(1)}%</b></span><span>라운드 이자 <b style={{ float: 'right' }}>{loanTerms.roundInterest.toLocaleString()}원</b></span><span>상환 예정 라운드 <b style={{ float: 'right' }}>{company.loanDueRound ? `R${company.loanDueRound}` : '-'}</b></span></div><input type="number" min="1000" step="1000" value={loanAmount} onChange={(event) => setLoanAmount(Math.max(1000, Math.floor(Number(event.target.value) || 1000)))} style={{ width: '100%', padding: '9px', marginTop: '12px' }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}><button disabled={!isDecision || loanAmount > loanTerms.availableLoan} onClick={borrowMoney}>대출 실행</button><button disabled={!isDecision || loanAmount > (company.loanBalance || 0) || loanAmount > company.cash} onClick={repayLoan}>원금 상환</button></div><small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>기준 연 4.5%에 부채비율별 위험 가산금리가 붙으며, 4개월인 매 라운드마다 연이자의 1/3을 냅니다.</small></>}</details></section>

    {plan?.settlementStatus === 'SETTLED' && <section className="student-result" style={{ ...card, border: '2px solid #16a34a', background: '#f0fdf4' }}>
      <h2 style={{ marginTop: 0, fontSize: '18px' }}>📊 Round {plan.roundNumber} 거래 결과</h2>
      <div style={{ display: 'grid', gap: '7px' }}>{(plan.disasterLossQuantity || 0) > 0 && <span style={{ color: '#b45309' }}>태풍 피해 <b style={{ float: 'right' }}>계획보다 {plan.disasterLossQuantity?.toLocaleString()}kg 감소</b></span>}<span>실제 시장가격 <b style={{ float: 'right' }}>{plan.marketPrice === null ? '거래 없음' : `${plan.marketPrice?.toLocaleString()}원`}</b></span><span>생산 및 판매량 <b style={{ float: 'right' }}>{plan.soldQuantity?.toLocaleString()}{quantityUnit}</b></span><span>매출 <b style={{ float: 'right', color: '#2563eb' }}>{plan.revenue?.toLocaleString()}원</b></span><span>영업이익 <b style={{ float: 'right', color: (plan.operatingProfit || 0) >= 0 ? '#059669' : '#dc2626' }}>{plan.operatingProfit?.toLocaleString()}원</b></span><span>이윤 <b style={{ float: 'right', color: (plan.economicProfit ?? plan.profit ?? 0) >= 0 ? '#059669' : '#dc2626' }}>{(plan.economicProfit ?? plan.profit)?.toLocaleString()}원</b></span><span>현금 변화 <b style={{ float: 'right', color: (plan.cashFlow || 0) >= 0 ? '#059669' : '#dc2626' }}>{plan.cashFlow?.toLocaleString()}원</b></span></div>
    </section>}
    </div>

    <div className="student-decision-right">
    <div className="student-sale-stack">
    <section className="student-sale" style={{ ...card, border: '2px solid #7c3aed' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>시장별 판매 방식</h2>
      <label style={{ display: 'block', marginBottom: '10px' }}>가격 방향 예측<select value={pricePrediction} disabled={Boolean(plan)} onChange={(event) => changePricePrediction(event.target.value as 'UP' | 'SAME' | 'DOWN')} style={{ width: '100%', marginTop: '6px', padding: '9px' }}><option value="UP">상승 — 이전 가격 이상만 조정</option><option value="SAME">유지 — 이전 가격 ±5%만 조정</option><option value="DOWN">하락 — 이전 가격 이하만 조정</option></select></label>
      {selectedMarket.priceControl === 'MARKET_PRICE' ? <p style={{ fontSize: '13px', color: '#64748b' }}>현재 라운드의 거래가격은 공개되지 않습니다. 신문과 판매 여부를 살펴보고 판매 가능한 최저 희망가격을 정하세요.</p> : <p style={{ fontSize: '13px', color: '#64748b' }}>스마트폰 과점시장에서는 낮은 가격 기업부터 판매되고, 남은 수요를 다음 기업이 가져갑니다.</p>}
      <div style={{ padding: '14px', background: '#f5f3ff', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}><span>{publicPriceLabel}</span><strong style={{ color: '#7c3aed' }}>{publicReferencePrice.toLocaleString()}원/{quantityUnit}</strong></div>
      <label style={{ display: 'block', marginTop: '10px' }}>{selectedMarket.priceControl === 'MARKET_PRICE' ? '최저 판매 희망가격' : '우리 기업 판매가격'}<input type="number" min={predictionMinimumPrice} max={predictionMaximumPrice} step="10" value={askingPrice} disabled={Boolean(plan) && room.roundPhase !== 'SELLING'} onChange={(e) => setAskingPrice(Math.max(predictionMinimumPrice, Math.min(predictionMaximumPrice, Number(e.target.value) || predictionMinimumPrice)))} style={{ width: '100%', marginTop: '6px', padding: '10px' }} /><small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>예측 범위 {predictionMinimumPrice.toLocaleString()}~{predictionMaximumPrice.toLocaleString()}원</small></label>
      <label style={{ display: 'block', marginTop: '10px' }}>최대 판매 희망 수량
        <input type="number" min="0" max={maximumSellableQuantity} step="1" value={desiredOfferedQuantity} disabled={Boolean(plan) || maximumSellableQuantity === 0} onChange={(event) => setOfferedQuantitySelection({ scope: offeredQuantityScope, quantity: Math.max(0, Math.min(maximumSellableQuantity, Math.floor(Number(event.target.value) || 0))) })} style={{ width: '100%', marginTop: '6px', padding: '10px' }} />
        <small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>{isRiceMarket && !isRiceHarvestRound ? '쌀은 수확 라운드에 누적 재고의 판매 수량을 정할 수 있습니다.' : `판매 가능 ${maximumSellableQuantity.toLocaleString()}${quantityUnit} · 판매하지 않은 물량은 다음 라운드 재고로 남습니다.`}</small>
      </label>
      {room.roundPhase === 'SELLING' && plan && <div style={{ display: 'flex', gap: '7px', marginTop: '9px', flexWrap: 'wrap' }}><button onClick={() => void applyAskingPrice(askingPrice - 10)}>− 10원 즉시 반영</button><button onClick={() => void applyAskingPrice(askingPrice + 10)}>+ 10원 즉시 반영</button></div>}
      {selectedMarket.priceControl === 'FIRM_PRICE' && <small style={{ display: 'block', marginTop: '7px', color: '#64748b' }}>현재 진입 기업 {selectedMarketParticipants}개사 · 가격이 높아질수록 수요가 점진적으로 감소합니다.</small>}
    </section>

    {room.roundPhase === 'SELLING' && plan && <section ref={sellingPanelRef} className="student-selling-progress" style={{ ...card, border: '2px solid #f59e0b', background: '#fffbeb' }}>
      <h2 style={{ marginTop: 0, fontSize: '18px' }}>🛒 4개월 판매 진행</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginBottom: '9px' }}>{[1, 2, 3, 4].map((month) => <div key={month} style={{ padding: '8px 4px', textAlign: 'center', borderRadius: '8px', background: month <= sellingMonth ? '#f59e0b' : '#fde68a', color: month <= sellingMonth ? '#fff' : '#92400e', fontWeight: 800 }}>{month}개월</div>)}</div>
      <progress value={sellingProgress} max={1} style={{ width: '100%' }} />
      <div style={{ display: 'grid', gap: '7px', marginTop: '10px' }}><span>현재 기간 <b style={{ float: 'right' }}>{sellingMonth}개월 차 / 4개월</b></span><span>적용 중인 희망가격 <b style={{ float: 'right' }}>{currentSalePrice.toLocaleString()}원</b></span><span>현재까지 판매 <b style={{ float: 'right', color: '#2563eb' }}>{liveSoldQuantity}{quantityUnit}</b></span><span>현재 남은 판매대상 <b style={{ float: 'right' }}>{Math.max(0, plannedSaleQuantity - liveSoldQuantity)}{quantityUnit}</b></span></div>
      <div style={{ marginTop: '12px', padding: '12px', borderRadius: '9px', border: '1px solid #fbbf24', background: '#fff' }}><strong>판매 중 희망가격 조정</strong><input aria-label="판매 진행 중 희망가격" type="number" min={predictionMinimumPrice} max={predictionMaximumPrice} step="10" value={askingPrice} onChange={(event) => setAskingPrice(Math.max(predictionMinimumPrice, Math.min(predictionMaximumPrice, Number(event.target.value) || predictionMinimumPrice)))} onBlur={() => void applyAskingPrice()} onKeyDown={(event) => { if (event.key === 'Enter') void applyAskingPrice(); }} style={{ width: '100%', padding: '10px', marginTop: '8px' }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginTop: '8px' }}><button onClick={() => void applyAskingPrice(askingPrice - 10)}>− 10원 즉시 반영</button><button onClick={() => void applyAskingPrice(askingPrice + 10)}>+ 10원 즉시 반영</button></div></div>
      <div style={{ marginTop: '12px', padding: '12px', borderRadius: '9px', background: projectedSellThrough < 1 ? '#fee2e2' : '#dcfce7', color: projectedSellThrough < 1 ? '#991b1b' : '#166534' }}><strong>🔎 판매 상황</strong><p style={{ margin: '5px 0 0', fontSize: '13px', lineHeight: 1.55 }}>{saleAnalysis}</p></div>
    </section>}

    <section className="student-inventory" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>{isRiceMarket && !isRiceHarvestRound ? '재배 중인 생산물' : '판매 후 남은 재고'}</h2><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{selectedMarket.icon} {selectedMarket.name}</strong><span><b>{inventory?.quantity || 0}{quantityUnit}</b> · 평균원가 {(inventory?.averageUnitCost || 0).toLocaleString()}원</span></div></section>
    </div>

    <section className="student-cost" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>비용과 예상 결과</h2>
      <div style={{ display: 'grid', gap: '7px', fontSize: '14px' }}>
        <span>임대료(고정비)<ConceptHelp concept="고정비" /> <b style={{ float: 'right' }}>{quote.rentCost.toLocaleString()}원</b></span>
        <span>총임금 <b style={{ float: 'right' }}>{quote.wageCost.toLocaleString()}원</b></span>
        {quote.earlyTerminationCost > 0 && <span>신규 고용자 조기퇴직 보상(라운드 임금의 25%) <b style={{ float: 'right', color: '#dc2626' }}>{quote.earlyTerminationCost.toLocaleString()}원</b></span>}
        <span>제품 1개당 재료비(가변비)<ConceptHelp concept="가변비" /> <b style={{ float: 'right' }}>{quote.unitMaterialCost.toLocaleString()}원</b></span>
        <span>총재료비 ({plannedProductionQty}{quantityUnit}) <b style={{ float: 'right' }}>{quote.materialCost.toLocaleString()}원</b></span>
        {(selectedMarket.producerTaxPerUnit > 0 || selectedMarket.producerSubsidyPerUnit > 0) && <span>생산자 세금·보조금 <b style={{ float: 'right', color: quote.policyCost <= 0 ? '#059669' : '#dc2626' }}>{quote.policyCost >= 0 ? '+' : '-'}{Math.abs(quote.policyCost).toLocaleString()}원</b></span>}
        <span>당기 총생산비 <b style={{ float: 'right' }}>{quote.productionCost.toLocaleString()}원</b></span>
        <span>총투자비(기계·업그레이드·진입비) <b style={{ float: 'right' }}>{quote.investmentCost.toLocaleString()}원</b></span>
        <span>이번 라운드 투자비 배분액(감가상각 등)<ConceptHelp concept="감가상각" /> <b style={{ float: 'right' }}>{quote.allocatedInvestmentCost.toLocaleString()}원</b></span>
        <span>기계 매각대금(현금 유입) <b style={{ float: 'right', color: '#059669' }}>-{quote.machineResaleRevenue.toLocaleString()}원</b></span>
        <span>시장 진입 설비비(최초 1회) <b style={{ float: 'right' }}>{quote.setupCost.toLocaleString()}원</b></span>
        <span style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>순 현금지출 <b style={{ float: 'right', color: '#dc2626' }}>{quote.netCashCost.toLocaleString()}원</b></span>
        <span>지출 가능 한도(보유 자본금의 100%) <b style={{ float: 'right' }}>{quote.spendingLimit.toLocaleString()}원</b></span>
        <span>평균비용<ConceptHelp concept="평균비용" /> / 한계비용<ConceptHelp concept="한계비용" /> <b style={{ float: 'right', color: '#7c3aed' }}>{quote.averageCost.toLocaleString()}원 / {marginalCostLabel}</b></span>
        <span style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>{isRiceMarket && !isRiceHarvestRound ? '이번 라운드 매출(재배 중)' : '판매 대상 전부 판매 시 예상매출'} <b style={{ float: 'right', color: '#2563eb' }}>{expectedRevenue.toLocaleString()}원</b></span>
        {isRiceMarket && <span>희망가격으로 수확물 판매 시 최대 매출 <b style={{ float: 'right', color: '#2563eb' }}>{desiredOfferedQuantity.toLocaleString()}kg × {askingPrice.toLocaleString()}원 = {(desiredOfferedQuantity * askingPrice).toLocaleString()}원</b></span>}
        <span>생산 직후 예상 보유 현금 <b style={{ float: 'right' }}>{(company.cash - quote.netCashCost).toLocaleString()}원</b></span>
        <span>전량 판매 후 예상 보유 현금 <b style={{ float: 'right', color: '#059669' }}>{(company.cash + expectedCashFlow).toLocaleString()}원</b></span>
        <span>예상 영업이익<ConceptHelp concept="영업이익" /> <b style={{ float: 'right', color: expectedOperatingProfit >= 0 ? '#059669' : '#dc2626' }}>{expectedOperatingProfit.toLocaleString()}원</b></span>
        <span>예상 이윤<ConceptHelp concept="이윤" /> <b style={{ float: 'right', color: expectedEconomicProfit >= 0 ? '#059669' : '#dc2626' }}>{expectedEconomicProfit.toLocaleString()}원</b></span>
        <span>예상 현금 변화 <b style={{ float: 'right', color: expectedCashFlow >= 0 ? '#059669' : '#dc2626' }}>{expectedCashFlow.toLocaleString()}원</b></span>
      </div>
      {remainingBudget < 0 && <p style={{ color: '#dc2626', fontWeight: 700 }}>지출 한도를 {Math.abs(remainingBudget).toLocaleString()}원 초과했습니다.</p>}
      <button onClick={confirmProduction} disabled={!canConfirm} style={{ width: '100%', padding: '13px', marginTop: '15px', border: 0, borderRadius: '9px', background: canConfirm ? '#2563eb' : '#cbd5e1', color: '#fff', fontWeight: 800 }}>{plan ? `Round ${plan.roundNumber} 생산 결정 완료` : !isDecision ? '기업 선택 시간이 아닙니다' : submitting ? '확정 중...' : '생산 결정 확정'}</button>
      {message && <p style={{ textAlign: 'center', color: plan ? '#15803d' : '#b45309' }}>{message}</p>}
    </section>

    {latestSettledRound > 0 && <section className="student-ranking" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>🏆 Round {latestSettledRound} 기업 이윤 비교</h2><p style={{ color: '#64748b', fontSize: '13px' }}>같은 시장가격에서도 시장 선택과 비용 구조에 따라 이윤이 달라집니다. 순위보다 전략의 차이를 비교해보세요.</p><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}><thead><tr><th>순위</th><th>기업</th><th>선택 시장</th><th>이번 라운드 이윤</th><th>누적 이윤</th></tr></thead><tbody>{profitRanking.map((item, index) => <tr key={item.id} style={{ borderTop: '1px solid #e2e8f0', background: item.id === company.id ? '#eff6ff' : '#fff' }}><td style={{ padding: '9px' }}>{index + 1}</td><td><strong>{item.name}{item.id === company.id ? ' (우리 기업)' : ''}</strong></td><td>{item.marketName}</td><td style={{ color: item.latestProfit >= 0 ? '#059669' : '#dc2626', fontWeight: 800 }}>{item.latestProfit.toLocaleString()}원</td><td>{item.cumulativeProfit.toLocaleString()}원</td></tr>)}</tbody></table></div></section>}

    <section className="student-hint" style={{ ...card, background: '#fefce8', borderColor: '#fef08a' }}><strong>💡 생각해보기</strong><p style={{ marginBottom: 0, fontSize: '13px', color: '#854d0e' }}>어느 시장이 가장 높은 이윤을 줄까요? 시장가격만 보지 말고 재료비, 한계비용, 투자비를 함께 비교하세요. 노동자를 계속 늘리면 한계생산이 감소하지만 기계와 기술은 그 감소를 완화합니다.</p></section>
    </div>
    </div>

    {room.roundPhase === 'RESULT' && reflectionDue && <div className="student-reflection-shell">
    {room.roundPhase === 'RESULT' && reflectionDue && <section style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>📝 {currentReflectionSheet.title}</h2><small style={{ color: '#64748b' }}>{reflectionInterval}라운드마다 제출</small>{reflection ? <p style={{ color: '#0f766e', fontWeight: 700 }}>Round {reflection.roundNumber} 활동지를 제출했습니다.</p> : <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>{currentReflectionSheet.questions.map((question, index) => <label key={question.id}>{index + 1}. {question.prompt}<textarea value={reflectionAnswers[question.id] || ''} onChange={(event) => setReflectionAnswers((current) => ({ ...current, [question.id]: event.target.value }))} rows={3} style={{ width: '100%', marginTop: '5px' }} /></label>)}<button onClick={submitReflection} style={{ padding: '11px', background: '#0f766e', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>활동지 제출</button></div>}</section>}
    </div>}

  </main></div>;
};
