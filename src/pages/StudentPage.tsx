import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FirmSupplyCurve } from '../components/FirmSupplyCurve';
import { ConceptHelp } from '../components/ConceptHelp';
import { calculateLoanTerms, calculateMarketClearing, calculateMarketDemand, calculateMinimumWorkerCount, calculateProductionQuote, companyService, getTechnologyMarketFit, productionService, reflectionService, roomService } from '../services';
import type { Company, InventoryItem, LearningReflection, ProductionPlan, Room } from '../types/domain';

const STUDENT_SESSION_KEY = 'marketlab:student-session';
const saveSession = (roomId: string, companyName: string) => {
  try { localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({ roomId, companyName })); } catch { /* 현재 접속은 유지 */ }
};
const errorText = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ROOM_NOT_FOUND') return '존재하지 않는 룸 코드입니다.';
  if (code === 'ROOM_NOT_JOINABLE') return '이미 시작된 수업에는 새 회사로 입장할 수 없습니다.';
  if (code === 'INVALID_COMPANY_NAME') return '회사 이름은 1자 이상 30자 이하로 입력해주세요.';
  return '회사 접속 중 오류가 발생했습니다.';
};

export const StudentPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const roomId = params.get('roomId') || '';
  const companyName = params.get('name') || '';
  const queryError = !roomId || !companyName ? '룸 코드 또는 회사 이름이 누락되었습니다.' : null;
  const [company, setCompany] = useState<Company | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(() => !queryError);
  const [error, setError] = useState<string | null>(() => queryError);
  const [selectedMarketId, setSelectedMarketId] = useState('market_tumbler');
  const [askingPrice, setAskingPrice] = useState(900);
  const [inventory, setInventory] = useState<InventoryItem | null>(null);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [marketPlans, setMarketPlans] = useState<ProductionPlan[]>([]);
  const [workerCount, setWorkerCount] = useState(1);
  const [productionQty, setProductionQty] = useState(10);
  const [machinePurchases, setMachinePurchases] = useState(0);
  const [machineSales, setMachineSales] = useState(0);
  const [researchLevels, setResearchLevels] = useState(0);
  const [loanAmount, setLoanAmount] = useState(10000);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [reflection, setReflection] = useState<LearningReflection | null>(null);
  const [reflectionAnswers, setReflectionAnswers] = useState({ marginalProductObservation: '', marketChangeObservation: '', nextStrategy: '' });
  const companyId = company?.id;
  const currentRound = room?.currentRound;
  const observedRound = useRef<number | null>(null);

  useEffect(() => {
    if (!roomId || !companyName) return;
    let mounted = true;
    companyService.registerCompany(roomId, companyName).then((value) => {
      if (!mounted) return;
      saveSession(roomId, value.name); setCompany(value); setWorkerCount(value.employeeCount || 1); setLoading(false);
    }).catch((reason) => { if (mounted) { setError(errorText(reason)); setLoading(false); } });
    const unsubscribe = roomService.subscribeRoom(roomId, (value) => {
      if (!mounted || !value) return;
      if (observedRound.current !== null && observedRound.current !== value.currentRound) {
        setMachinePurchases(0);
        setMachineSales(0);
        setResearchLevels(0);
        setProductionQty(10);
        setSelectedMarketId('market_tumbler');
        setAskingPrice(900);
        setMessage(null);
        setReflection(null);
        setReflectionAnswers({ marginalProductObservation: '', marketChangeObservation: '', nextStrategy: '' });
      }
      observedRound.current = value.currentRound;
      setRoom(value);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [roomId, companyName]);

  useEffect(() => {
    if (!companyId) return;
    return companyService.subscribeCompany(roomId, companyId, (value) => {
      if (value) setCompany(value);
      else { setCompany(null); setError('교사가 이 기업을 삭제했습니다.'); }
    });
  }, [roomId, companyId]);

  useEffect(() => {
    if (!companyId || currentRound === undefined) return;
    return productionService.subscribeProductionPlan(roomId, companyId, currentRound, (value) => {
      setPlan(value);
      if (value?.askingPrice) setAskingPrice(value.askingPrice);
    });
  }, [roomId, companyId, currentRound]);

  useEffect(() => {
    if (currentRound === undefined) return;
    return productionService.subscribeRoundProductionPlans(roomId, currentRound, setMarketPlans);
  }, [roomId, currentRound]);

  useEffect(() => { if (room?.roundPhase !== 'SELLING') return; const timer = window.setInterval(() => setClock(Date.now()), 500); return () => window.clearInterval(timer); }, [room?.roundPhase]);
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

  const selectedMarket = room.markets.find((market) => market.id === (plan?.productId || selectedMarketId)) || room.markets[0];
  const minimumWorkerCount = calculateMinimumWorkerCount(company, room.currentRound);
  const quantityUnit = selectedMarket.id === 'market_toy' ? '포대' : '개';
  const savedProductionTarget = company.productionTargets?.[selectedMarket.id];
  const productionTargetLocked = selectedMarket.productionCycleRounds > 1 && (room.currentRound - 1) % selectedMarket.productionCycleRounds !== 0 && savedProductionTarget !== undefined;
  const plannedProductionQty = productionTargetLocked ? savedProductionTarget : productionQty;
  const sellableMachineCount = (company.machineAssets || []).filter((asset) => asset.marketId === selectedMarket.id && asset.purchasedRound < room.currentRound).reduce((sum, asset) => sum + asset.quantity, 0);
  const quote = calculateProductionQuote(company, selectedMarket, plannedProductionQty, workerCount, machinePurchases, researchLevels, !inventory, room.currentRound, machineSales);
  const remainingBudget = quote.spendingLimit - quote.netCashCost;
  const effectivePrice = selectedMarket.priceControl === 'FIRM_PRICE' ? askingPrice : selectedMarket.announcedPrice;
  const expectedRevenue = effectivePrice * plannedProductionQty;
  const expectedSalesDemand = selectedMarket.priceControl === 'FIRM_PRICE'
    ? calculateMarketDemand(selectedMarket, askingPrice, room.demandEvents.find((event) => event.marketId === selectedMarket.id)?.multiplier || 1)
    : selectedMarket.demandAtBasePrice;
  const selectedMarketParticipants = new Set(marketPlans.filter((item) => item.productId === selectedMarket.id).map((item) => item.companyId)).size;
  const expectedOperatingProfit = expectedRevenue - quote.productionCost;
  const expectedEconomicProfit = expectedRevenue - quote.economicCost;
  const expectedCashFlow = expectedRevenue + quote.machineResaleRevenue - quote.totalCost;
  const isRunning = room.status === 'RUNNING';
  const isDecision = isRunning && room.roundPhase === 'DECISION';
  const canConfirm = isDecision && !plan && !submitting && plannedProductionQty > 0 && workerCount >= minimumWorkerCount && quote.currentMarginalProduct > 0 && plannedProductionQty <= quote.productionCapacity && remainingBudget >= 0 && quote.machineCountAfter <= selectedMarket.maxMachines;
  const marginalCostLabel = quote.marginalCost === null ? '생산 불가' : `${quote.marginalCost.toLocaleString()}원/개`;
  const newspaperEvents = room.pendingDemandEvents.length > 0 ? room.pendingDemandEvents : room.demandEvents;
  const newspaperRound = room.pendingDemandEvents.length > 0 && room.status === 'RUNNING' ? room.currentRound + 1 : room.currentRound;
  const sellingProgress = room.roundPhase === 'SELLING' ? Math.max(0, Math.min(1, (clock - (room.sellingStartedAt || clock)) / 30000)) : 0;
  const sellingMonth = Math.min(4, Math.max(1, Math.ceil(sellingProgress * 4)));
  const selectedClearing = calculateMarketClearing(selectedMarket, marketPlans.filter((item) => item.productId === selectedMarket.id), room.demandEvents.find((event) => event.marketId === selectedMarket.id)?.multiplier || 1);
  const loanTerms = calculateLoanTerms(company, inventory ? [inventory] : [], room.currentRound);
  const projectedSoldQuantity = plan ? selectedClearing.soldByPlan.get(plan.id) || 0 : 0;
  const liveSoldQuantity = Math.min(projectedSoldQuantity, Math.floor(projectedSoldQuantity * sellingProgress));
  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 22px' } as const;

  const confirmProduction = async () => {
    if (!canConfirm) return;
    if (!window.confirm(`${selectedMarket.name}에서 ${plannedProductionQty}${quantityUnit}를 생산할까요? 적용 가격은 ${effectivePrice.toLocaleString()}원입니다.`)) return;
    try {
      setSubmitting(true); setMessage(null);
      await productionService.confirmProduction({ roomId, companyId: company.id, marketId: selectedMarket.id, requestedQuantity: plannedProductionQty, workerCount, machinePurchases, machineSales, researchLevels, askingPrice });
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
        PRODUCTION_TARGET_LOCKED: '쌀 생산계획은 3개 라운드 동안 변경할 수 없습니다.',
        MACHINE_FEATURE_LOCKED: '기계 투자 기능은 Round 2부터 사용할 수 있습니다.',
        RESEARCH_FEATURE_LOCKED: '기술개발 기능은 Round 3부터 사용할 수 있습니다.',
      };
      setMessage(messages[code] || '생산 확정 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
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
  const lowerAskingPrice = async () => { if (!plan) return; try { await productionService.updateAskingPrice(roomId, company.id, room.currentRound, askingPrice); setMessage('희망가격 인하가 다음 판매 계산에 반영됩니다.'); } catch { setMessage('가격은 판매 중에 현재 희망가격보다 낮게만 변경할 수 있습니다.'); } };
  const submitReflection = async () => {
    if (!reflectionAnswers.marginalProductObservation.trim() || !reflectionAnswers.marketChangeObservation.trim() || !reflectionAnswers.nextStrategy.trim()) return setMessage('활동지의 세 문항을 모두 작성해주세요.');
    await reflectionService.save({ roomId, companyId: company.id, companyName: company.name, roundNumber: room.currentRound, ...reflectionAnswers });
    setMessage('경제 활동지가 제출되었습니다.');
  };

  return <div style={{ minHeight: '100vh', padding: '28px 16px', background: '#f8fafc' }}><main className="student-dashboard">
    <section className="student-company" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><div><small style={{ color: '#64748b' }}>룸 {room.id} · {room.title}</small><h1 style={{ margin: '3px 0' }}>🏢 {company.name}</h1></div><button onClick={logout} style={{ height: '34px' }}>로그아웃</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '14px' }}>
        <div><small>보유 자본금</small><strong style={{ display: 'block', color: '#059669' }}>{company.cash.toLocaleString()}원</strong></div>
        <div><small>보유 기계</small><strong style={{ display: 'block' }}>{company.machineCount || 1}대</strong></div>
        <div><small>기술 수준</small><strong style={{ display: 'block' }}>Lv.{company.technologyLevel || 0}</strong></div>
      </div>
    </section>

    <section className="student-round" style={{ ...card, borderColor: isRunning ? '#86efac' : '#fde68a', background: isRunning ? '#f0fdf4' : '#fffbeb' }}>
      <strong>{room.status === 'WAITING' ? '⏳ 교사가 수업을 시작하기 전입니다.' : room.status === 'FINISHED' ? '🏁 수업이 종료되었습니다.' : room.roundPhase === 'RESULT' ? `📊 Round ${room.currentRound} 거래 결과` : room.roundPhase === 'SELLING' ? `🛒 Round ${room.currentRound} 판매 ${sellingMonth}개월 차 / 4개월` : room.roundPhase === 'SETTLING' ? `⏳ Round ${room.currentRound} 거래 계산 중` : `▶ Round ${room.currentRound} 기업 선택 중`}</strong>
      <span style={{ display: 'block', fontSize: '13px', color: '#64748b', marginTop: '4px' }}>1라운드는 4개월입니다. 카페·스마트폰은 매 라운드, 쌀 생산량은 3라운드마다 조절합니다.</span>
    </section>

    <section className="student-news" style={{ ...card, border: '2px solid #d97706', background: '#fffbeb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}><div><small style={{ color: '#92400e', fontWeight: 900 }}>MARKETLAB ECONOMY</small><h2 style={{ margin: '3px 0', fontFamily: 'Georgia, serif' }}>📰 Round {newspaperRound} 시장 신문</h2></div><span style={{ color: '#92400e', fontSize: '12px' }}>기사 속 단서를 찾아보세요</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '12px', marginTop: '13px' }}>{newspaperEvents.map((event) => { const market = room.markets.find((item) => item.id === event.marketId); return <article key={event.marketId} style={{ padding: '15px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px' }}><small style={{ color: '#64748b', fontWeight: 800 }}>{market?.icon} {market?.name}</small><h3 style={{ margin: '7px 0', fontSize: '17px', fontFamily: 'Georgia, serif' }}>{event.articleHeadline}</h3><p style={{ margin: 0, lineHeight: 1.65, color: '#334155', fontSize: '13px' }}>{event.articleBody}</p></article>; })}</div>
    </section>

    {room.currentRound === 1 && <section className="student-diagnosis" style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa', gridColumn: '1 / -1' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>🔎 생산 시작 전 우리 기업 진단서</h2><p style={{ color: '#475569', fontSize: '13px' }}>{company.technologyIcon} <strong>{company.technologyName}</strong>의 강점은 시장마다 다르게 나타납니다. 아래는 노동자 3명·기본 기계 1대로 시험생산한 결과이며 실제 자본금은 사용하지 않습니다.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>{room.markets.map((market) => { const sample = calculateProductionQuote(company, market, 1, 3); const fit = getTechnologyMarketFit(company, market); return <article key={market.id} style={{ padding: '13px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '10px' }}><strong>{market.icon} {market.name}</strong><span style={{ display: 'block', marginTop: '7px' }}>시험 생산능력 <b style={{ float: 'right' }}>{sample.productionCapacity.toLocaleString()}{market.id === 'market_toy' ? '포대' : '개'}</b></span><span style={{ display: 'block' }}>제품 1개당 재료비 <b style={{ float: 'right' }}>{sample.unitMaterialCost.toLocaleString()}원</b></span><small style={{ display: 'block', marginTop: '8px', color: '#0f766e' }}>{fit.hint}</small></article>; })}</div><p style={{ marginBottom: 0, fontSize: '12px', color: '#64748b' }}>생산량이 가장 많은 시장만 고르지 말고, 다른 상품을 포기하는 정도와 시장가격·비용을 함께 비교해보세요.</p></section>}

    <section className="student-market" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>1. 어떤 시장에 뛰어들 것인가?</h2>
      <p style={{ color: '#64748b', fontSize: '13px' }}>카페와 쌀(20kg)은 시장가격을 따르는 가격수용자입니다. 스마트폰은 가격과 생산량을 직접 결정합니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '10px' }}>{room.markets.map((market) => {
        const chosen = selectedMarket.id === market.id;
        return <button type="button" key={market.id} disabled={Boolean(plan) || !isDecision} onClick={() => { setSelectedMarketId(market.id); setAskingPrice(market.announcedPrice); }} style={{ textAlign: 'left', padding: '14px', borderRadius: '11px', border: chosen ? '2px solid #2563eb' : '1px solid #e2e8f0', background: chosen ? '#eff6ff' : '#fff' }}>
          <span style={{ fontSize: '25px' }}>{market.icon}</span><strong style={{ display: 'block' }}>{market.name}</strong><b style={{ color: '#dc2626' }}>{market.priceControl === 'FIRM_PRICE' ? '시장 기준가격' : '시장가격'} {market.announcedPrice.toLocaleString()}원</b><small style={{ display: 'block', color: '#475569', marginTop: '4px', fontWeight: 700 }}>우리 기업의 제품 1개당 재료비 {Math.round(market.materialUnitCost * market.materialCostMultiplier * getTechnologyMarketFit(company, market).material).toLocaleString()}원</small>
        </button>;
      })}</div>
    </section>

    <section className="student-investment" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>2. 설비와 기술에 투자할 것인가?</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-2px 0 12px', padding: '10px 12px', background: '#eff6ff', borderRadius: '9px', color: '#1e3a8a' }}><span>현재 {selectedMarket.name} 기존 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'}</span><strong>{quote.marketMachineCountBefore}대</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px' }}>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>새 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'} 구입 대수
          <input type="number" min="0" step="1" value={room.currentRound < 2 ? 0 : machinePurchases} disabled={Boolean(plan) || room.currentRound < 2} onChange={(e) => setMachinePurchases(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={{ width: '100%', marginTop: '8px', padding: '9px' }} />
          <small>{room.currentRound < 2 ? '🔒 Round 2부터 기계 투자가 열립니다.' : `1대 ${selectedMarket.machinePrice.toLocaleString()}원 · 구입 후 ${quote.machineCountAfter}/${selectedMarket.maxMachines}대 · 라운드 임대료 ${quote.rentCost.toLocaleString()}원`}</small>
        </label>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>기존 {selectedMarket.id === 'market_toy' ? '농기계' : '기계'} 매각 대수
          <input type="number" min="0" max={sellableMachineCount} step="1" value={machineSales} disabled={Boolean(plan) || room.currentRound < 2} onChange={(e) => setMachineSales(Math.max(0, Math.min(sellableMachineCount, Math.floor(Number(e.target.value) || 0))))} style={{ width: '100%', marginTop: '8px', padding: '9px' }} />
          <small>매각 가능 {sellableMachineCount}대 · 예상 유입 {quote.machineResaleRevenue.toLocaleString()}원</small>
        </label>
        <label style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}><input type="checkbox" checked={room.currentRound >= 3 && researchLevels === 1} disabled={Boolean(plan) || room.currentRound < 3} onChange={(e) => setResearchLevels(e.target.checked ? 1 : 0)} /> 이번 라운드 기술개발
          <strong style={{ display: 'block', marginTop: '9px' }}>{quote.researchCost.toLocaleString()}원</strong><small>{room.currentRound < 3 ? '🔒 Round 3부터 기술개발이 열립니다.' : `생산성 +10% · 개발 후 Lv.${quote.technologyLevelAfter}`}</small>
        </label>
      </div>
      <p style={{ fontSize: '13px', color: '#475569' }}>기계는 노동자 혼잡을 줄여 한계생산 감소를 늦추고, 기술개발은 이후 라운드에도 생산성을 높입니다.</p>
    </section>

    <section className="student-production" style={{ ...card, border: '2px solid #2563eb' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>3. 고용과 생산 결정</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <label>총 고용 노동자 수<input type="number" min={minimumWorkerCount} step="1" value={workerCount} disabled={Boolean(plan)} onChange={(e) => setWorkerCount(Math.max(minimumWorkerCount, Math.floor(Number(e.target.value) || 1)))} style={{ width: '100%', padding: '10px', marginTop: '6px' }} /><small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>기존 {company.employeeCount || 1}명 · 이번 라운드 최소 {minimumWorkerCount}명 · 추가고용 {Math.max(0, workerCount - (company.employeeCount || 1))}명 · 1명당 {selectedMarket.wagePerWorker.toLocaleString()}원 · 총임금 <strong style={{ color: '#7c3aed' }}>{quote.wageCost.toLocaleString()}원</strong></small></label>
        <label>목표 생산량<input type="number" min="1" max={quote.productionCapacity} step="1" value={plannedProductionQty} disabled={Boolean(plan) || productionTargetLocked} onChange={(e) => setProductionQty(Math.max(1, Math.min(quote.productionCapacity, Math.floor(Number(e.target.value) || 1))))} style={{ width: '100%', padding: '10px', marginTop: '6px' }} /><small style={{ display: 'block', marginTop: '4px', color: productionTargetLocked ? '#b45309' : '#64748b' }}>{productionTargetLocked ? `연간 생산계획 ${savedProductionTarget}${quantityUnit} 고정 · 다음 조정은 Round ${room.currentRound + (selectedMarket.productionCycleRounds - ((room.currentRound - 1) % selectedMarket.productionCycleRounds))}` : `현재 노동·자본으로 최대 ${quote.productionCapacity}${quantityUnit}`}</small></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px', marginTop: '14px' }}>
        {[['최대 생산 가능량', `${quote.productionCapacity}개`, null], ['마지막 노동자의 한계생산', `${quote.currentMarginalProduct}개`, '한계생산물'], ['다음 노동자의 한계생산', `${quote.nextMarginalProduct}개`, '한계생산물'], ['현재 한계비용', marginalCostLabel, '한계비용']].map(([label, value, concept]) => <div key={label} style={{ padding: '11px', background: '#f8fafc', borderRadius: '9px' }}><small>{label}{concept && <ConceptHelp concept={concept as '한계생산물' | '한계비용'} />}</small><strong style={{ display: 'block', color: '#1d4ed8' }}>{value}</strong></div>)}
      </div>
      <div style={{ marginTop: '14px', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
        <FirmSupplyCurve points={quote.supplyCurve} selectedQuantity={plannedProductionQty} selectedMarginalCost={quote.marginalCost} quantityUnit={quantityUnit} />
        <label style={{ display: 'block', marginTop: '10px', fontSize: '13px', fontWeight: 700 }}>우리 기업의 희망 공급량
          <input type="range" min="1" max={Math.max(1, quote.productionCapacity)} step="1" value={plannedProductionQty} disabled={Boolean(plan) || productionTargetLocked} onChange={(event) => setProductionQty(Number(event.target.value))} style={{ width: '100%', marginTop: '8px' }} />
          <span style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 400 }}><small>1{quantityUnit}</small><strong style={{ color: '#b45309' }}>{plannedProductionQty.toLocaleString()}{quantityUnit}</strong><small>{quote.productionCapacity.toLocaleString()}{quantityUnit}</small></span>
        </label>
      </div>
      {plannedProductionQty > quote.productionCapacity && <p style={{ color: '#dc2626', fontSize: '13px' }}>⚠️ 목표 생산량을 만들려면 노동자를 더 고용하거나 기계·기술에 투자해야 합니다.</p>}
      {quote.currentMarginalProduct === 0 && <p style={{ color: '#dc2626', fontSize: '13px' }}>⚠️ 자본설비에 비해 노동자가 너무 많아 마지막 노동자의 한계생산이 0입니다. 이 고용량으로는 생산을 확정할 수 없습니다.</p>}
    </section>

    <section className="student-sale" style={{ ...card, border: '2px solid #7c3aed' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>4. 시장별 판매 방식</h2>
      {selectedMarket.priceControl === 'MARKET_PRICE' ? <><p style={{ fontSize: '13px', color: '#64748b' }}>시장거래가격을 받아들이되, 판매 가능한 최저 희망가격은 직접 정합니다. 희망가격이 시장가격보다 높으면 판매되지 않습니다.</p><div style={{ padding: '14px', background: '#f5f3ff', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}><span>현재 시장거래가격</span><strong style={{ color: '#7c3aed' }}>{selectedClearing.marketPrice.toLocaleString()}원/개</strong></div></> : <p style={{ fontSize: '13px', color: '#64748b' }}>스마트폰 과점시장에서는 낮은 가격 기업부터 판매되고, 남은 수요를 다음 기업이 가져갑니다.</p>}
      <label style={{ display: 'block', marginTop: '10px' }}>{selectedMarket.priceControl === 'MARKET_PRICE' ? '최저 판매 희망가격' : '우리 기업 판매가격'}<input type="number" min="100" step="10" value={askingPrice} disabled={Boolean(plan) && room.roundPhase !== 'SELLING'} onChange={(e) => setAskingPrice(Math.max(100, Number(e.target.value) || 100))} style={{ width: '100%', marginTop: '6px', padding: '10px' }} /></label>
      {room.roundPhase === 'SELLING' && plan && <button onClick={lowerAskingPrice} disabled={askingPrice >= (plan.askingPrice || plan.announcedPrice)} style={{ marginTop: '9px', padding: '9px 12px' }}>희망가격 인하 적용</button>}
      {selectedMarket.priceControl === 'FIRM_PRICE' && <small style={{ display: 'block', marginTop: '7px', color: '#64748b' }}>현재 진입 기업 {selectedMarketParticipants}개사 · 이 가격의 시장수요 약 {expectedSalesDemand}개 · 가격이 높아질수록 수요가 점진적으로 감소합니다.</small>}
    </section>

    {room.roundPhase === 'SELLING' && plan && <section className="student-result" style={{ ...card, border: '2px solid #f59e0b', background: '#fffbeb' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>🛒 4개월 판매 진행</h2><progress value={sellingProgress} max={1} style={{ width: '100%' }} /><div style={{ display: 'grid', gap: '7px', marginTop: '10px' }}><span>현재 기간 <b style={{ float: 'right' }}>{sellingMonth}개월 차 / 4개월</b></span><span>시장거래가격 <b style={{ float: 'right' }}>{selectedClearing.marketPrice.toLocaleString()}원</b></span><span>내 희망가격 <b style={{ float: 'right' }}>{(plan.askingPrice || plan.announcedPrice).toLocaleString()}원</b></span><span>현재까지 판매 <b style={{ float: 'right', color: '#2563eb' }}>{liveSoldQuantity}{quantityUnit}</b></span><span>예상 최종 판매 <b style={{ float: 'right' }}>{projectedSoldQuantity}{quantityUnit}</b></span><span>남은 재고 <b style={{ float: 'right' }}>{Math.max(0, plan.producedQuantity - liveSoldQuantity)}{quantityUnit}</b></span></div></section>}

    <section className="student-cost" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>5. 비용과 예상 결과</h2>
      <div style={{ display: 'grid', gap: '7px', fontSize: '14px' }}>
        <span>임대료(고정비)<ConceptHelp concept="고정비" /> <b style={{ float: 'right' }}>{quote.rentCost.toLocaleString()}원</b></span>
        <span>총임금 <b style={{ float: 'right' }}>{quote.wageCost.toLocaleString()}원</b></span>
        <span>제품 1개당 재료비(가변비)<ConceptHelp concept="가변비" /> <b style={{ float: 'right' }}>{quote.unitMaterialCost.toLocaleString()}원</b></span>
        <span>총재료비 ({plannedProductionQty}{quantityUnit}) <b style={{ float: 'right' }}>{quote.materialCost.toLocaleString()}원</b></span>
        <span>당기 총생산비 <b style={{ float: 'right' }}>{quote.productionCost.toLocaleString()}원</b></span>
        <span>총투자비(기계·기술·진입비) <b style={{ float: 'right' }}>{quote.investmentCost.toLocaleString()}원</b></span>
        <span>이번 라운드 투자비 배분액(감가상각 등)<ConceptHelp concept="감가상각" /> <b style={{ float: 'right' }}>{quote.allocatedInvestmentCost.toLocaleString()}원</b></span>
        <span>기계 매각대금(현금 유입) <b style={{ float: 'right', color: '#059669' }}>-{quote.machineResaleRevenue.toLocaleString()}원</b></span>
        <span>시장 진입 설비비(최초 1회) <b style={{ float: 'right' }}>{quote.setupCost.toLocaleString()}원</b></span>
        <span style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>순 현금지출 <b style={{ float: 'right', color: '#dc2626' }}>{quote.netCashCost.toLocaleString()}원</b></span>
        <span>지출 가능 한도(보유 자본금의 100%) <b style={{ float: 'right' }}>{quote.spendingLimit.toLocaleString()}원</b></span>
        <span>평균비용<ConceptHelp concept="평균비용" /> / 한계비용<ConceptHelp concept="한계비용" /> <b style={{ float: 'right', color: '#7c3aed' }}>{quote.averageCost.toLocaleString()}원 / {marginalCostLabel}</b></span>
        <span style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>생산량 전부 판매 시 예상매출 <b style={{ float: 'right', color: '#2563eb' }}>{expectedRevenue.toLocaleString()}원</b></span>
        <span>예상 영업이익<ConceptHelp concept="영업이익" /> <b style={{ float: 'right', color: expectedOperatingProfit >= 0 ? '#059669' : '#dc2626' }}>{expectedOperatingProfit.toLocaleString()}원</b></span>
        <span>예상 경제적 이윤<ConceptHelp concept="경제적이윤" /> <b style={{ float: 'right', color: expectedEconomicProfit >= 0 ? '#059669' : '#dc2626' }}>{expectedEconomicProfit.toLocaleString()}원</b></span>
        <span>예상 현금 변화 <b style={{ float: 'right', color: expectedCashFlow >= 0 ? '#059669' : '#dc2626' }}>{expectedCashFlow.toLocaleString()}원</b></span>
      </div>
      {remainingBudget < 0 && <p style={{ color: '#dc2626', fontWeight: 700 }}>지출 한도를 {Math.abs(remainingBudget).toLocaleString()}원 초과했습니다.</p>}
      <button onClick={confirmProduction} disabled={!canConfirm} style={{ width: '100%', padding: '13px', marginTop: '15px', border: 0, borderRadius: '9px', background: canConfirm ? '#2563eb' : '#cbd5e1', color: '#fff', fontWeight: 800 }}>{plan ? `Round ${plan.roundNumber} 생산 결정 완료` : !isDecision ? '기업 선택 시간이 아닙니다' : submitting ? '확정 중...' : '생산 결정 확정'}</button>
      {message && <p style={{ textAlign: 'center', color: plan ? '#15803d' : '#b45309' }}>{message}</p>}
    </section>

    <section className="student-finance" style={card}><details open={room.currentRound >= 5}><summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '18px' }}>🏦 선택 활동: 은행 대출 {room.currentRound < 5 && '🔒'}</summary>{room.currentRound < 5 ? <p style={{ color: '#64748b', fontSize: '13px' }}>Round 5부터 열립니다. 대출은 생산의 핵심 활동이 아니라 금리 변화가 투자와 공급에 미치는 영향을 살펴보는 확장 기능입니다.</p> : <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '7px', marginTop: '12px', fontSize: '13px' }}><span>인정 자산 <b style={{ float: 'right' }}>{loanTerms.recognizedAssets.toLocaleString()}원</b></span><span>현재 대출잔액 <b style={{ float: 'right' }}>{(company.loanBalance || 0).toLocaleString()}원</b></span><span>추가 대출 가능액 <b style={{ float: 'right' }}>{loanTerms.availableLoan.toLocaleString()}원</b></span><span>적용 연이율 <b style={{ float: 'right' }}>{(company.loanAnnualRate || loanTerms.annualRate).toFixed(1)}%</b></span><span>라운드 이자 <b style={{ float: 'right' }}>{loanTerms.roundInterest.toLocaleString()}원</b></span><span>상환 예정 라운드 <b style={{ float: 'right' }}>{company.loanDueRound ? `R${company.loanDueRound}` : '-'}</b></span></div><input type="number" min="1000" step="1000" value={loanAmount} onChange={(event) => setLoanAmount(Math.max(1000, Math.floor(Number(event.target.value) || 1000)))} style={{ width: '100%', padding: '9px', marginTop: '12px' }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}><button disabled={!isDecision || loanAmount > loanTerms.availableLoan} onClick={borrowMoney}>대출 실행</button><button disabled={!isDecision || loanAmount > (company.loanBalance || 0) || loanAmount > company.cash} onClick={repayLoan}>원금 상환</button></div><small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>기준 연 4.5%에 부채비율별 위험 가산금리가 붙으며, 4개월인 매 라운드마다 연이자의 1/3을 냅니다.</small></>}</details></section>

    {plan?.settlementStatus === 'SETTLED' && <section className="student-result" style={{ ...card, border: '2px solid #16a34a', background: '#f0fdf4' }}>
      <h2 style={{ marginTop: 0, fontSize: '18px' }}>📊 Round {plan.roundNumber} 거래 결과</h2>
      <div style={{ display: 'grid', gap: '7px' }}><span>실제 시장가격 <b style={{ float: 'right' }}>{plan.marketPrice === null ? '거래 없음' : `${plan.marketPrice?.toLocaleString()}원`}</b></span><span>생산 및 판매량 <b style={{ float: 'right' }}>{plan.soldQuantity?.toLocaleString()}개</b></span><span>매출 <b style={{ float: 'right', color: '#2563eb' }}>{plan.revenue?.toLocaleString()}원</b></span><span>영업이익 <b style={{ float: 'right', color: (plan.operatingProfit || 0) >= 0 ? '#059669' : '#dc2626' }}>{plan.operatingProfit?.toLocaleString()}원</b></span><span>경제적 이윤 <b style={{ float: 'right', color: (plan.economicProfit ?? plan.profit ?? 0) >= 0 ? '#059669' : '#dc2626' }}>{(plan.economicProfit ?? plan.profit)?.toLocaleString()}원</b></span><span>현금 변화 <b style={{ float: 'right', color: (plan.cashFlow || 0) >= 0 ? '#059669' : '#dc2626' }}>{plan.cashFlow?.toLocaleString()}원</b></span></div>
    </section>}

    {room.roundPhase === 'RESULT' && room.currentRound % 3 === 0 && <section style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa' }}><h2 style={{ marginTop: 0, fontSize: '18px' }}>📝 1년 경제 활동지</h2>{reflection ? <p style={{ color: '#0f766e', fontWeight: 700 }}>Round {reflection.roundNumber} 활동지를 제출했습니다.</p> : <div style={{ display: 'grid', gap: '10px' }}><label>노동자를 추가했을 때 한계생산물과 한계비용은 어떻게 변했나요?<textarea value={reflectionAnswers.marginalProductObservation} onChange={(event) => setReflectionAnswers((current) => ({ ...current, marginalProductObservation: event.target.value }))} rows={3} style={{ width: '100%', marginTop: '5px' }} /></label><label>수요·공급 변화가 시장가격에 어떤 영향을 주었나요?<textarea value={reflectionAnswers.marketChangeObservation} onChange={(event) => setReflectionAnswers((current) => ({ ...current, marketChangeObservation: event.target.value }))} rows={3} style={{ width: '100%', marginTop: '5px' }} /></label><label>다음 1년에는 어떤 결정을 바꾸겠나요?<textarea value={reflectionAnswers.nextStrategy} onChange={(event) => setReflectionAnswers((current) => ({ ...current, nextStrategy: event.target.value }))} rows={3} style={{ width: '100%', marginTop: '5px' }} /></label><button onClick={submitReflection} style={{ padding: '11px', background: '#0f766e', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>활동지 제출</button></div>}</section>}

    <section className="student-inventory" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>📦 선택 시장 재고</h2><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{selectedMarket.icon} {selectedMarket.name}</strong><span><b>{inventory?.quantity || 0}개</b> · 평균원가 {(inventory?.averageUnitCost || 0).toLocaleString()}원</span></div></section>

    <section className="student-hint" style={{ ...card, background: '#fefce8', borderColor: '#fef08a' }}><strong>💡 생각해보기</strong><p style={{ marginBottom: 0, fontSize: '13px', color: '#854d0e' }}>어느 시장이 가장 높은 이윤을 줄까요? 시장가격만 보지 말고 재료비, 한계비용, 투자비를 함께 비교하세요. 노동자를 계속 늘리면 한계생산이 감소하지만 기계와 기술은 그 감소를 완화합니다.</p></section>
  </main></div>;
};
