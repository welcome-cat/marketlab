import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateCompetitiveMarket, companyService, productionService, reflectionService, roomService, scaleMarketEventFactor } from '../services';
import type { Company, DemandEvent, EconomicsQuiz, EventIntensity, LearningReflection, MarketRoundResult, ProductionPlan, Room, UnlockRounds } from '../types/domain';
import { DEFAULT_ECONOMICS_QUIZZES, DEFAULT_UNLOCK_ROUNDS, DEMAND_EVENT_OPTIONS, EVENT_INTENSITY_LABEL, EVENT_INTENSITY_SCALE, MARKETS, UPGRADE_OPTIONS } from '../types/domain';
import { MarketCurveChart } from '../components/MarketCurveChart';
import { composeEventArticle, defaultNewsTemplates } from '../services/newsService';

const statusLabel = { WAITING: '시작 전', RUNNING: '진행 중', FINISHED: '종료' } as const;
type MarketInfluenceDraft = Record<string, { studentSupplyWeight: number; demandEventEffectScale: number; supplyEventEffectScale: number }>;
const influenceFromMarkets = (markets: Room['markets']): MarketInfluenceDraft => Object.fromEntries(markets.map((market) => [market.id, { studentSupplyWeight: market.studentSupplyWeight, demandEventEffectScale: market.demandEventEffectScale, supplyEventEffectScale: market.supplyEventEffectScale }]));
const eventDirectionLabel = (option: (typeof DEMAND_EVENT_OPTIONS)[number], subject: '수요' | '공급') => {
  if (option.id === 'eco_preference') return '이벤트';
  if (option.factor === 'BASELINE') return `${subject} 변화 없음`;
  if (option.id === 'producer_tax') return '공급 감소';
  if (option.id === 'producer_subsidy') return '공급 증가';
  const value = subject === '공급' ? option.supplyMultiplier ?? 1 : option.multiplier;
  return value > 1 ? `${subject} 증가` : value < 1 ? `${subject} 감소` : `${subject} 변화 없음`;
};
const eventOptionLabel = (option: (typeof DEMAND_EVENT_OPTIONS)[number], subject: '수요' | '공급') =>
  option.factor === 'BASELINE' ? `${subject} 변화 없음` : `${eventDirectionLabel(option, subject)}: ${option.title}`;
const DEFAULT_NEWS_TEMPLATES = defaultNewsTemplates();
const LEGACY_COMBINED_HEADLINE = '시장 현장에 새로운 변수…업계, 소비자와 생산자의 움직임 주시';
const mergeNewsTemplates = (stored: Room['newsTemplates']) => Object.fromEntries(Object.entries(DEFAULT_NEWS_TEMPLATES).map(([id, fallback]) => {
  const saved = stored?.[id];
  return [id, !saved || saved.headline === LEGACY_COMBINED_HEADLINE ? fallback : saved];
}));

export const TeacherPage: React.FC = () => {
  const navigate = useNavigate();
  const [teacherAuthenticated, setTeacherAuthenticated] = useState(() => sessionStorage.getItem('marketlab:teacher-auth') === '1');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roundPlans, setRoundPlans] = useState<ProductionPlan[]>([]);
  const [roundResults, setRoundResults] = useState<MarketRoundResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomAction, setRoomAction] = useState(false);
  const [companyActionId, setCompanyActionId] = useState<string | null>(null);
  const [demandSelections, setDemandSelections] = useState<Record<string, string>>({});
  const [supplySelections, setSupplySelections] = useState<Record<string, string>>({});
  const [demandIntensities, setDemandIntensities] = useState<Record<string, EventIntensity>>({});
  const [supplyIntensities, setSupplyIntensities] = useState<Record<string, EventIntensity>>({});
  const [taxDraft, setTaxDraft] = useState<Record<string, number>>({});
  const [subsidyDraft, setSubsidyDraft] = useState<Record<string, number>>({});
  const [disasterChanceDraft, setDisasterChanceDraft] = useState<Record<string, number>>({});
  const [disasterLossDraft, setDisasterLossDraft] = useState<Record<string, number>>({});
  const [materialPriceDraft, setMaterialPriceDraft] = useState<Record<string, number>>({});
  const [wageDraft, setWageDraft] = useState<Record<string, number>>({});
  const [rentDraft, setRentDraft] = useState<Record<string, number>>({});
  const [newsGenerating, setNewsGenerating] = useState(false);
  const [newsMessage, setNewsMessage] = useState<string | null>(null);
  const [newsEdits, setNewsEdits] = useState<Record<string, { headline?: string; body?: string; supplyHeadline?: string; supplyBody?: string }>>({});
  const [clock, setClock] = useState(0);
  const [reflections, setReflections] = useState<LearningReflection[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [unlockDraft, setUnlockDraft] = useState<UnlockRounds>(DEFAULT_UNLOCK_ROUNDS);
  const [quizDraft, setQuizDraft] = useState<EconomicsQuiz[]>(DEFAULT_ECONOMICS_QUIZZES);
  const [quizScheduleDraft, setQuizScheduleDraft] = useState<Record<string, string | null>>({});
  const [showForecast, setShowForecast] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNewsTemplates, setShowNewsTemplates] = useState(false);
  const [newsTemplateDraft, setNewsTemplateDraft] = useState<Record<string, { headline: string; body: string }>>(DEFAULT_NEWS_TEMPLATES);
  const [marketInfluenceDraft, setMarketInfluenceDraft] = useState<MarketInfluenceDraft>(() => influenceFromMarkets(MARKETS));
  const automaticSettlementKey = useRef('');
  const eventDraftRoundKey = useRef('');
  const activeRoomId = activeRoom?.id;
  const activeRound = activeRoom?.currentRound;

  useEffect(() => {
    const dashboard = document.querySelector('.teacher-dashboard');
    if (!dashboard) return;
    const enhance = () => dashboard.querySelectorAll<HTMLElement>(':scope > section').forEach((section) => {
      if (section.querySelector(':scope > .teacher-zoom-button')) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'teacher-zoom-button'; button.title = '팝업으로 크게 보기'; button.textContent = '🔍';
      button.onclick = (event) => { event.stopPropagation(); const expanded = section.classList.toggle('teacher-panel-expanded'); button.textContent = expanded ? '✕' : '🔍'; document.body.classList.toggle('teacher-modal-open', expanded); };
      section.prepend(button);
    });
    enhance();
    const observer = new MutationObserver(enhance); observer.observe(dashboard, { childList: true });
    return () => observer.disconnect();
  }, [activeRoomId, selectedCompanyId, showNewsTemplates]);

  useEffect(() => roomService.subscribeRooms(setRooms), []);
  useEffect(() => { if (activeRoom?.roundPhase !== 'SELLING') return; const timer = window.setInterval(() => setClock(Date.now()), 500); return () => window.clearInterval(timer); }, [activeRoom?.roundPhase]);
  useEffect(() => {
    if (!activeRoomId || activeRoom?.roundPhase !== 'SELLING' || !activeRoom.sellingEndsAt) return;
    const key = `${activeRoomId}:${activeRoom.currentRound}`;
    const settleAutomatically = async () => {
      if (automaticSettlementKey.current === key) return;
      automaticSettlementKey.current = key;
      try { setRoomAction(true); await productionService.settleRound(activeRoomId); }
      catch (error) {
        automaticSettlementKey.current = '';
        if (!(error instanceof Error && error.message === 'ROUND_NOT_OPEN')) alert('자동 판매 확정 중 오류가 발생했습니다. 다시 시도해주세요.');
      } finally { setRoomAction(false); }
    };
    const remaining = activeRoom.sellingEndsAt - Date.now();
    if (remaining <= 0) { void settleAutomatically(); return; }
    const timer = window.setTimeout(() => void settleAutomatically(), remaining + 100);
    return () => window.clearTimeout(timer);
  }, [activeRoom?.currentRound, activeRoom?.roundPhase, activeRoom?.sellingEndsAt, activeRoomId]);
  useEffect(() => {
    if (!activeRoomId || activeRound === undefined) return;
    const key = `${activeRoomId}:${activeRound}`;
    if (!eventDraftRoundKey.current) { eventDraftRoundKey.current = key; return; }
    if (eventDraftRoundKey.current === key) return;
    eventDraftRoundKey.current = key;
    setDemandSelections(Object.fromEntries(MARKETS.map((market) => [market.id, 'baseline'])));
    setSupplySelections(Object.fromEntries(MARKETS.map((market) => [market.id, 'supply_baseline'])));
    setDemandIntensities(Object.fromEntries(MARKETS.map((market) => [market.id, 'MEDIUM'])));
    setSupplyIntensities(Object.fromEntries(MARKETS.map((market) => [market.id, 'MEDIUM'])));
    setNewsEdits({});
    setShowForecast(false);
  }, [activeRoomId, activeRound]);
  useEffect(() => {
    if (!activeRoomId) return;
    const unsubscribeRoom = roomService.subscribeRoom(activeRoomId, (value) => value && setActiveRoom(value));
    const unsubscribeCompanies = companyService.subscribeCompanies(activeRoomId, setCompanies);
    return () => { unsubscribeRoom(); unsubscribeCompanies(); };
  }, [activeRoomId]);


  useEffect(() => {
    if (!activeRoomId || activeRound === undefined) return;
    return productionService.subscribeRoundProductionPlans(
      activeRoomId,
      activeRound,
      setRoundPlans,
    );
  }, [activeRoomId, activeRound]);

  useEffect(() => {
    if (!activeRoomId || activeRound === undefined) return;
    return reflectionService.subscribeRound(activeRoomId, activeRound, setReflections);
  }, [activeRoomId, activeRound]);

  useEffect(() => {
    if (!activeRoomId || activeRound === undefined) return;
    return productionService.subscribeRoundResults(activeRoomId, activeRound, setRoundResults);
  }, [activeRoomId, activeRound]);

  const handleCreateRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomId.trim() || !title.trim()) return alert('룸 코드와 수업 제목을 입력해주세요.');
    try {
      setLoading(true);
      await roomService.createRoom(roomId.trim(), title.trim());
      const demandEvents: DemandEvent[] = MARKETS.map((market) => ({ marketId: market.id, optionId: 'baseline', factor: 'BASELINE', title: '수요 변화 없음', description: '특별한 수요 변화 요인이 없습니다.', multiplier: 1, articleHeadline: `${market.name}, 평온한 흐름 이어져`, articleBody: '관련 업계에서는 최근 소비 환경에 뚜렷한 변화가 관찰되지 않고 있다고 전했습니다.', generatedBy: 'TEMPLATE' }));
      setActiveRoom({ id: roomId.trim(), title: title.trim(), markets: MARKETS, currentRound: 1, status: 'WAITING', roundPhase: 'DECISION', demandEvents, pendingDemandEvents: [], unlockRounds: DEFAULT_UNLOCK_ROUNDS, economicsQuizzes: DEFAULT_ECONOMICS_QUIZZES, createdAt: Date.now() });
      setQuizDraft(DEFAULT_ECONOMICS_QUIZZES);
      setMarketInfluenceDraft(influenceFromMarkets(MARKETS));
      setDemandSelections(Object.fromEntries(MARKETS.map((market) => [market.id, 'baseline'])));
      setSupplySelections(Object.fromEntries(MARKETS.map((market) => [market.id, 'supply_baseline'])));
      setDemandIntensities(Object.fromEntries(MARKETS.map((market) => [market.id, 'MEDIUM'])));
      setSupplyIntensities(Object.fromEntries(MARKETS.map((market) => [market.id, 'MEDIUM'])));
      setShowCreateRoom(false);
    } catch (error) {
      alert(error instanceof Error && error.message === 'ROOM_ALREADY_EXISTS' ? '이미 사용 중인 룸 코드입니다.' : '룸 생성 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  const runRoomAction = async (action: 'start' | 'sell' | 'settle' | 'next' | 'finish') => {
    if (!activeRoom) return;
    const prompt = action === 'start'
      ? activeRoom.pendingDemandEvents.length === activeRoom.markets.length
        ? '준비한 수요·공급 신문을 배포하고 1라운드를 시작할까요?'
        : '아직 다음 시장 신문을 확정하지 않았습니다. 모든 시장의 수요·공급 변화를 그대로 유지한 채 1라운드를 시작할까요?'
      : action === 'sell'
        ? '기업 선택을 마감하고 30초(4개월) 판매를 시작할까요? 판매 중에는 학생이 가격을 올리거나 내리며 판매 속도와 예상 재고를 확인할 수 있습니다.'
        : action === 'settle'
          ? '4개월 판매 결과를 확정할까요?'
        : action === 'next'
          ? `Round ${activeRoom.currentRound + 1}로 넘어가기 전 확인해주세요.\n\n• 다음 라운드가 시작되면 신문 발행과 수요·공급 사건 선택을 더 이상 변경할 수 없습니다.\n• ${activeRoom.pendingDemandEvents.length === activeRoom.markets.length ? '현재 준비된 신문이 학생들에게 배포됩니다.' : '확정한 신문이 없어 수요·공급 변화 없음으로 진행됩니다.'}\n• 현재 라운드의 거래 결과는 확정된 상태로 유지됩니다.\n• 학생들의 새 생산·판매 결정과 경제 퀴즈가 열립니다.\n\n계속 진행할까요?`
          : '수업을 종료할까요? 종료 후에는 생산할 수 없습니다.';
    if (!window.confirm(prompt)) return;
    try {
      setRoomAction(true);
      if (action === 'start') await roomService.startRoom(activeRoom.id);
      if (action === 'sell') await productionService.startSelling(activeRoom.id);
      if (action === 'settle') await productionService.settleRound(activeRoom.id);
      if (action === 'next') await roomService.advanceRound(activeRoom.id);
      if (action === 'finish') await roomService.finishRoom(activeRoom.id);
    } catch {
      alert('라운드 상태 변경 중 오류가 발생했습니다.');
    }
    finally { setRoomAction(false); }
  };

  const handleRenameCompany = async (company: Company) => {
    const nextName = window.prompt('새 팀명을 입력하세요.', company.name);
    if (nextName === null || nextName.trim() === company.name) return;
    try { setCompanyActionId(company.id); await companyService.renameCompany(company.roomId, company.id, nextName); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      alert(code === 'COMPANY_NAME_ALREADY_EXISTS' ? '이미 사용 중인 팀명입니다.' : '팀명 수정 중 오류가 발생했습니다.');
    } finally { setCompanyActionId(null); }
  };

  const handleDeleteCompany = async (company: Company) => {
    if (!window.confirm(`${company.name} 기업과 재고·생산기록을 삭제할까요? 복구할 수 없습니다.`)) return;
    try { setCompanyActionId(company.id); await companyService.deleteCompany(company.roomId, company.id); }
    catch { alert('기업 삭제 중 오류가 발생했습니다.'); }
    finally { setCompanyActionId(null); }
  };

  const handleEditRoom = async () => {
    if (!activeRoom) return;
    const nextTitle = window.prompt('수업명을 입력하세요.', activeRoom.title);
    if (nextTitle === null) return;
    const nextRoomId = activeRoom.status === 'RUNNING'
      ? activeRoom.id
      : window.prompt('새 룸 코드를 입력하세요.', activeRoom.id);
    if (nextRoomId === null) return;
    try {
      setRoomAction(true);
      const updatedRoom = await roomService.updateRoom(activeRoom.id, nextRoomId, nextTitle);
      setActiveRoom(updatedRoom);
      if (updatedRoom.id !== activeRoom.id) alert(`룸 코드가 ${updatedRoom.id}(으)로 변경되었습니다. 학생들에게 새 코드를 안내해주세요.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const messages: Record<string, string> = {
        ROOM_ALREADY_EXISTS: '이미 사용 중인 룸 코드입니다.',
        INVALID_ROOM_ID: '룸 코드는 1자 이상 40자 이하로 입력해주세요.',
        INVALID_ROOM_TITLE: '수업명은 1자 이상 80자 이하로 입력해주세요.',
        ROOM_CODE_CHANGE_WHILE_RUNNING: '진행 중인 수업의 룸 코드는 변경할 수 없습니다.',
      };
      alert(messages[code] || '룸 정보 수정 중 오류가 발생했습니다.');
    } finally { setRoomAction(false); }
  };

  const handleDeleteRoom = async (targetRoom: Room | null = activeRoom) => {
    if (!targetRoom) return;
    if (!window.confirm(`${targetRoom.title} (${targetRoom.id}) 룸을 삭제할까요? 진행 상태와 관계없이 모든 기업·재고·생산·거래 기록이 삭제되며 복구할 수 없습니다.`)) return;
    try {
      setRoomAction(true);
      await roomService.deleteRoom(targetRoom.id);
      if (activeRoom?.id === targetRoom.id) setActiveRoom(null);
    } catch { alert('룸 삭제 중 오류가 발생했습니다.'); }
    finally { setRoomAction(false); }
  };

  const openRoom = (room: Room) => {
    eventDraftRoundKey.current = `${room.id}:${room.currentRound}`;
    setActiveRoom(room);
    setUnlockDraft(room.unlockRounds);
    setQuizDraft(room.economicsQuizzes);
    setQuizScheduleDraft(room.quizSchedule || {});
    setMarketInfluenceDraft(influenceFromMarkets(room.markets));
    setNewsTemplateDraft(mergeNewsTemplates(room.newsTemplates));
    setDemandSelections(Object.fromEntries(room.markets.map((market) => [
      market.id,
      room.pendingDemandEvents.find((event) => event.marketId === market.id)?.optionId || 'baseline',
    ])));
    setSupplySelections(Object.fromEntries(room.markets.map((market) => [market.id, room.pendingDemandEvents.find((event) => event.marketId === market.id)?.supplyOptionId || 'supply_baseline'])));
    setDemandIntensities(Object.fromEntries(room.markets.map((market) => [market.id, room.pendingDemandEvents.find((event) => event.marketId === market.id)?.demandIntensity || 'MEDIUM'])));
    setSupplyIntensities(Object.fromEntries(room.markets.map((market) => [market.id, room.pendingDemandEvents.find((event) => event.marketId === market.id)?.supplyIntensity || 'MEDIUM'])));
  };

  const canPrepareDemandEvents = activeRoom?.status === 'WAITING'
    || (activeRoom?.status === 'RUNNING' && activeRoom.roundPhase === 'RESULT');

  const handleRandomDemandEvents = () => {
    if (!activeRoom || !canPrepareDemandEvents) return;
    const demandChoices = DEMAND_EVENT_OPTIONS.filter((option) => option.effectType !== 'SUPPLY' && option.id !== 'baseline');
    const supplyChoices = DEMAND_EVENT_OPTIONS.filter((option) => option.effectType === 'SUPPLY' && option.id !== 'supply_baseline');
    setDemandSelections(Object.fromEntries(activeRoom.markets.map((market) => [
      market.id,
      demandChoices[Math.floor(Math.random() * demandChoices.length)].id,
    ])));
    setSupplySelections(Object.fromEntries(activeRoom.markets.map((market) => [market.id, supplyChoices.filter((option) => option.id !== 'rice_typhoon' || market.id === 'market_toy')[Math.floor(Math.random() * supplyChoices.filter((option) => option.id !== 'rice_typhoon' || market.id === 'market_toy').length)].id])));
  };

  const handleConfirmDemandEvents = async () => {
    if (!activeRoom) return;
    if (!canPrepareDemandEvents) {
      setNewsMessage('신문은 수업 시작 전 또는 현재 라운드의 거래 결과가 확정된 뒤에만 발행할 수 있습니다.');
      return;
    }
    try {
      setNewsGenerating(true);
      setNewsMessage(null);
      const events = await Promise.all(activeRoom.markets.map(async (market): Promise<DemandEvent> => {
        const option = DEMAND_EVENT_OPTIONS.find((item) => item.id === demandSelections[market.id]) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'baseline')!;
        const supplyOption = DEMAND_EVENT_OPTIONS.find((item) => item.id === supplySelections[market.id]) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'supply_baseline')!;
        const demandIntensity = demandIntensities[market.id] || 'MEDIUM';
        const supplyIntensity = supplyIntensities[market.id] || 'MEDIUM';
        const isTaxPolicy = supplyOption.id === 'producer_tax' || supplyOption.id === 'producer_subsidy';
        const edit = newsEdits[market.id];
        const demandTemplate = newsTemplateDraft[option.id]; const supplyTemplate = newsTemplateDraft[supplyOption.id];
        const demandArticle = composeEventArticle(market, option, 'CONSUMER');
        const supplyArticle = composeEventArticle(market, supplyOption, 'PRODUCTION');
        return { marketId: market.id, optionId: option.id, factor: option.factor, effectType: 'DEMAND', title: option.title, description: option.description, multiplier: option.multiplier, ecoPreferenceBoost: option.ecoPreferenceBoost || 0, demandIntensity, supplyIntensity, supplyOptionId: supplyOption.id, supplyFactor: supplyOption.factor, supplyTitle: supplyOption.title, supplyDescription: supplyOption.description, supplyMaterialMultiplier: supplyOption.id.startsWith('material_') && materialPriceDraft[market.id] ? materialPriceDraft[market.id] / Math.max(1, market.materialUnitCost * market.materialCostMultiplier) : supplyOption.materialMultiplier || 1, supplyWageMultiplier: supplyOption.id.startsWith('wage_') && wageDraft[market.id] ? wageDraft[market.id] / Math.max(1, market.wagePerWorker) : supplyOption.wageMultiplier || 1, supplyRentMultiplier: supplyOption.id.startsWith('rent_') && rentDraft[market.id] ? rentDraft[market.id] / Math.max(1, market.rentPerRound) : 1, supplyProductivityMultiplier: supplyOption.productivityMultiplier || 1, supplyCurveMultiplier: isTaxPolicy ? 1 : supplyOption.supplyMultiplier || 1, producerTaxPerUnit: supplyOption.id === 'producer_tax' ? Math.max(0, taxDraft[market.id] || 0) : 0, producerSubsidyPerUnit: supplyOption.id === 'producer_subsidy' ? Math.max(0, subsidyDraft[market.id] || 0) : 0, disasterLossChance: supplyOption.id === 'rice_typhoon' ? Math.max(0, Math.min(1, (disasterChanceDraft[market.id] || 40) / 100)) : 0, disasterLossRate: supplyOption.id === 'rice_typhoon' ? Math.max(0, Math.min(1, (disasterLossDraft[market.id] || 30) / 100)) : 0, articleHeadline: edit?.headline?.trim() || demandTemplate?.headline || demandArticle.headline, articleBody: edit?.body?.trim() || demandTemplate?.body || demandArticle.body, supplyArticleHeadline: edit?.supplyHeadline?.trim() || supplyTemplate?.headline || supplyArticle.headline, supplyArticleBody: edit?.supplyBody?.trim() || supplyTemplate?.body || supplyArticle.body, generatedBy: 'TEMPLATE' };
      }));
      await roomService.updateMarketInfluence(activeRoom.id, marketInfluenceDraft);
      await roomService.confirmDemandEvents(activeRoom.id, events);
      setNewsMessage(`Round ${activeRoom.status === 'WAITING' ? activeRoom.currentRound : activeRoom.currentRound + 1} 시장 신문이 발행되었습니다.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setNewsMessage(code === 'DEMAND_EVENT_SELECTION_NOT_ALLOWED'
        ? '신문은 수업 시작 전 또는 라운드 거래 결과가 확정된 뒤에만 발행할 수 있습니다.'
        : code === 'INVALID_DEMAND_EVENTS'
          ? '모든 시장의 사건을 선택한 뒤 다시 발행해주세요.'
          : '신문을 저장하지 못했습니다. 네트워크 연결과 Firebase 권한을 확인한 뒤 다시 시도해주세요.');
    } finally { setNewsGenerating(false); }
  };

  const saveUnlockRounds = async () => {
    if (!activeRoom) return;
    try {
      setRoomAction(true);
      await roomService.updateUnlockRounds(activeRoom.id, unlockDraft);
      setActiveRoom({ ...activeRoom, unlockRounds: unlockDraft });
      alert('라운드별 해금 조건을 저장했습니다.');
    } catch { alert('해금 라운드는 1~20 사이의 정수로 입력해주세요.'); }
    finally { setRoomAction(false); }
  };

  const updateQuizDraft = (index: number, update: Partial<EconomicsQuiz>) => {
    setQuizDraft((current) => current.map((quiz, quizIndex) => quizIndex === index ? { ...quiz, ...update } : quiz));
  };

  const saveEconomicsQuizzes = async () => {
    if (!activeRoom) return;
    try {
      setRoomAction(true);
      await roomService.updateEconomicsQuizzes(activeRoom.id, quizDraft, quizScheduleDraft);
      setActiveRoom({ ...activeRoom, economicsQuizzes: quizDraft, quizSchedule: quizScheduleDraft });
      alert('경제 퀴즈 문제은행과 라운드별 출제표를 저장했습니다.');
    } catch {
      alert('문제와 세 선택지를 모두 입력하고, 보상은 0~100,000원으로 설정해주세요.');
    } finally { setRoomAction(false); }
  };

  const saveMarketInfluence = async () => {
    if (!activeRoom) return;
    try {
      setRoomAction(true);
      await roomService.updateMarketInfluence(activeRoom.id, marketInfluenceDraft);
      setActiveRoom({ ...activeRoom, markets: activeRoom.markets.map((market) => ({ ...market, ...(marketInfluenceDraft[market.id] || {}) })) });
      alert('시장 변화 효과 배율을 저장했습니다.');
    } catch { alert('학생 공급 배율은 1~100배, 사건 크기는 0~1,000% 범위로 입력해주세요.'); }
    finally { setRoomAction(false); }
  };

  const resetMarketInfluence = () => {
    if (!activeRoom) return;
    setMarketInfluenceDraft(Object.fromEntries(activeRoom.markets.map((market) => [market.id, {
      studentSupplyWeight: 1,
      demandEventEffectScale: 1,
      supplyEventEffectScale: 1,
    }])));
  };

  const eventForecasts = activeRoom?.markets.map((market) => {
    const option = DEMAND_EVENT_OPTIONS.find((item) => item.id === (demandSelections[market.id] || 'baseline')) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'baseline')!;
    const supplyOption = DEMAND_EVENT_OPTIONS.find((item) => item.id === (supplySelections[market.id] || 'supply_baseline')) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'supply_baseline')!;
    const demandScale = EVENT_INTENSITY_SCALE[demandIntensities[market.id] || 'MEDIUM'];
    const supplyScale = EVENT_INTENSITY_SCALE[supplyIntensities[market.id] || 'MEDIUM'];
    const demandMultiplier = option.effectType === 'SUPPLY' ? 1 : scaleMarketEventFactor(option.multiplier, demandScale);
    const supplyMultiplier = scaleMarketEventFactor(supplyOption.supplyMultiplier, supplyScale);
    const priceFactor = market.marketType === 'PERFECT_COMPETITION'
      ? Math.pow(demandMultiplier / supplyMultiplier, 1 / Math.max(0.1, market.priceElasticity + market.supplyElasticity))
      : Math.pow(demandMultiplier / supplyMultiplier, 0.5);
    return {
      market,
      option,
      supplyOption,
      price: Math.max(10, Math.round((market.basePrice * priceFactor) / 10) * 10),
      demand: Math.round(market.demandAtBasePrice * demandMultiplier),
      materialCost: supplyOption.id.startsWith('material_') && materialPriceDraft[market.id] ? materialPriceDraft[market.id] : Math.round(market.materialUnitCost * market.materialCostMultiplier * scaleMarketEventFactor(supplyOption.materialMultiplier, supplyScale)),
      wage: supplyOption.id.startsWith('wage_') && wageDraft[market.id] ? wageDraft[market.id] : Math.round(market.wagePerWorker * scaleMarketEventFactor(supplyOption.wageMultiplier, supplyScale)),
      productivity: Math.round(market.firstWorkerProductivity * scaleMarketEventFactor(supplyOption.productivityMultiplier, supplyScale) * 100) / 100,
    };
  }) || [];

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) || null;
  const selectedCompanyPlan = selectedCompany ? roundPlans.find((plan) => plan.companyId === selectedCompany.id) : null;

  const marketStats = activeRoom?.markets.map((market) => {
    const plans = roundPlans.filter((plan) => plan.productId === market.id);
    return {
      ...market,
      companyCount: new Set(plans.map((plan) => plan.companyId)).size,
      totalSupply: plans.reduce((sum, plan) => sum + plan.producedQuantity, 0),
      expectedMarketSales: plans.reduce(
        (sum, plan) => sum + plan.producedQuantity * market.announcedPrice,
        0,
      ),
      result: roundResults.find((result) => result.marketId === market.id),
      demandEvent: activeRoom?.demandEvents.find((event) => event.marketId === market.id),
    };
  }) || [];
  const card = { background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 2px 5px rgba(0,0,0,.03)' } as const;
  const sellingSecondsLeft = Math.max(0, Math.ceil(((activeRoom?.sellingEndsAt || 0) - clock) / 1000));

  if (!teacherAuthenticated) return <div className="teacher-login"><form onSubmit={(event) => { event.preventDefault(); if (teacherPassword !== '13579246') return alert('비밀번호가 올바르지 않습니다.'); sessionStorage.setItem('marketlab:teacher-auth', '1'); setTeacherAuthenticated(true); }}><h1>👨‍🏫 교사용 대시보드</h1><p>교사 비밀번호를 입력해주세요.</p><input autoFocus aria-label="교사 비밀번호" type="password" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} /><button type="submit">로그인</button><button type="button" onClick={() => navigate('/')}>돌아가기</button></form></div>;

  return <div className="teacher-page" style={{ minHeight: '100vh', background: '#f8fafc' }}>
    <main className="teacher-shell">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div><span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb' }}>MARKETLAB TEACHER</span><h1 style={{ margin: '3px 0', fontSize: '24px' }}>👨‍🏫 교사용 대시보드</h1></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {activeRoom && <button onClick={() => setActiveRoom(null)} style={{ padding: '8px 11px' }}>다른 룸</button>}
          <button onClick={() => { sessionStorage.removeItem('marketlab:teacher-auth'); navigate('/', { replace: true }); }} style={{ padding: '8px 11px' }}>로그아웃</button>
        </div>
      </header>

      {!activeRoom ? <div className="teacher-room-home">
        <div className="teacher-room-toolbar"><div><h2>수업 룸</h2><p>수업을 열거나 새 경제 수업을 개설하세요.</p></div><button type="button" onClick={() => setShowCreateRoom((value) => !value)}>{showCreateRoom ? '만들기 닫기' : '＋ 새 수업 룸 만들기'}</button></div>
        {showCreateRoom && <section className="teacher-create-room" style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>새 수업 룸 만들기</h2><p style={{ color: '#64748b', fontSize: '13px' }}>카페 음료·쌀(1포대=10kg)·운동화 경쟁시장과 스마트폰 도전시장이 함께 열립니다.</p><form onSubmit={handleCreateRoom}><input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="룸 코드 (예: 경제-3반)" /><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="수업 제목" /><button disabled={loading}>{loading ? '생성 중...' : '수업 룸 개설'}</button></form></section>}
        {rooms.length === 0 ? <section style={card}><p style={{ color: '#64748b', margin: 0 }}>아직 개설된 룸이 없습니다.</p></section> : <div className="teacher-room-tiles">{rooms.map((room) =>
          <article key={room.id} className="teacher-room-tile">
            <div><span className={'room-status ' + room.status.toLowerCase()}>{statusLabel[room.status]}</span><h3>{room.title}</h3><strong>룸 코드 {room.id}</strong><p>Round {room.currentRound} · 4개 시장</p></div>
            <div className="room-tile-actions"><button onClick={() => openRoom(room)}>열기</button><button className="danger" disabled={roomAction} onClick={() => void handleDeleteRoom(room)}>삭제</button></div>
          </article>)}</div>}
      </div> : <div className="teacher-dashboard">
        <section className="teacher-room-summary" style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div><h2 style={{ margin: 0 }}>{activeRoom.title}</h2><p style={{ margin: '5px 0', color: '#2563eb', fontWeight: 800 }}>룸 코드 {activeRoom.id}</p><span style={{ color: '#64748b' }}>Round {activeRoom.currentRound} ({(activeRoom.currentRound - 1) * 4 + 1}~{activeRoom.currentRound * 4}개월) · {statusLabel[activeRoom.status]} · {companies.length}개사</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button disabled={roomAction} onClick={handleEditRoom} style={{ padding: '11px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#334155', fontWeight: 700 }}>룸 정보 수정</button>
              <button disabled={roomAction || activeRoom.roundPhase === 'SETTLING'} onClick={() => void handleDeleteRoom(activeRoom)} style={{ padding: '11px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontWeight: 700 }}>룸 삭제</button>
              {activeRoom.status === 'WAITING' && <button disabled={roomAction} onClick={() => runRoomAction('start')} style={{ padding: '11px 16px', background: '#16a34a', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>1라운드 시작</button>}
              {activeRoom.status === 'RUNNING' && <>{activeRoom.roundPhase === 'DECISION' ? <button disabled={roomAction} onClick={() => runRoomAction('sell')} style={{ padding: '11px 16px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>30초 판매 시작</button> : activeRoom.roundPhase === 'SELLING' ? <button disabled={roomAction || sellingSecondsLeft > 0} onClick={() => runRoomAction('settle')} style={{ padding: '11px 16px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>{sellingSecondsLeft > 0 ? `판매 중 ${sellingSecondsLeft}초` : '판매 결과 확정'}</button> : activeRoom.roundPhase === 'SETTLING' ? <button disabled style={{ padding: '11px 16px' }}>거래 계산 중...</button> : <button disabled={roomAction} onClick={() => runRoomAction('next')} style={{ padding: '11px 16px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>다음 라운드</button>}<button disabled={roomAction || activeRoom.roundPhase === 'SETTLING'} onClick={() => runRoomAction('finish')} style={{ padding: '11px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px' }}>수업 종료</button></>}
            </div>
          </div>
        </section>

        <section className="teacher-quizzes" style={{ ...card, border: '2px solid #16a34a', background: '#f0fdf4' }}>
          <div>
            <h3 style={{ margin: 0 }}>💰 경제 퀴즈 목록 설정</h3>
            <p style={{ color: '#166534', fontSize: '13px' }}>문제은행을 만든 뒤 라운드마다 출제할 문제를 선택하세요. 퀴즈를 내지 않을 라운드는 ‘출제 안 함’으로 지정할 수 있습니다.</p>
            <h4 style={{ marginBottom: '8px' }}>라운드별 출제표</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px' }}>{Array.from({ length: 20 }, (_, index) => { const round = String(index + 1); return <label key={round} style={{ padding: '8px', background: '#fff', border: '1px solid #bbf7d0', borderRadius: '8px' }}>Round {round}<select value={quizScheduleDraft[round] || ''} onChange={(event) => setQuizScheduleDraft((current) => ({ ...current, [round]: event.target.value || null }))} style={{ width: '100%', marginTop: '4px', padding: '7px' }}><option value="">출제 안 함</option>{quizDraft.map((quiz, quizIndex) => <option key={quiz.id} value={quiz.id}>문제 {quizIndex + 1} · {quiz.question}</option>)}</select></label>; })}</div>
            <button type="button" onClick={() => setQuizScheduleDraft(Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(index + 1), null])))} style={{ margin: '9px 0 14px' }}>전체 라운드 출제 안 함</button>
            <div style={{ display: 'grid', gap: '10px' }}>{quizDraft.map((quiz, index) => <article key={quiz.id} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #86efac', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}><strong>문제 {index + 1}</strong><button type="button" disabled={quizDraft.length <= 1} onClick={() => { setQuizDraft((current) => current.filter((_, quizIndex) => quizIndex !== index)); setQuizScheduleDraft((current) => Object.fromEntries(Object.entries(current).map(([round, quizId]) => [round, quizId === quiz.id ? null : quizId]))); }} style={{ color: '#dc2626' }}>삭제</button></div>
              <label style={{ display: 'block', marginTop: '8px' }}>질문<input value={quiz.question} maxLength={200} onChange={(event) => updateQuizDraft(index, { question: event.target.value })} style={{ width: '100%', padding: '9px', marginTop: '4px' }} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '8px', marginTop: '8px' }}>{quiz.choices.map((choice, choiceIndex) => <label key={choiceIndex}>선택지 {choiceIndex + 1}<input value={choice} maxLength={100} onChange={(event) => { const choices = [...quiz.choices] as EconomicsQuiz['choices']; choices[choiceIndex] = event.target.value; updateQuizDraft(index, { choices }); }} style={{ width: '100%', padding: '8px', marginTop: '4px' }} /></label>)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(150px,1fr))', gap: '8px', marginTop: '8px' }}><label>정답<select value={quiz.answer} onChange={(event) => updateQuizDraft(index, { answer: Number(event.target.value) })} style={{ width: '100%', padding: '8px', marginTop: '4px' }}>{quiz.choices.map((_, choiceIndex) => <option key={choiceIndex} value={choiceIndex}>선택지 {choiceIndex + 1}</option>)}</select></label><label>정답 보상액<input type="number" min="0" max="100000" step="1000" value={quiz.reward} onChange={(event) => updateQuizDraft(index, { reward: Number(event.target.value) })} style={{ width: '100%', padding: '8px', marginTop: '4px' }} /></label></div>
            </article>)}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}><button type="button" disabled={quizDraft.length >= 20} onClick={() => setQuizDraft((current) => [...current, { id: `quiz-${Date.now()}`, question: '새 경제 문제를 입력하세요.', choices: ['선택지 1', '선택지 2', '선택지 3'], answer: 0, reward: 20000 }])}>문제 추가</button><button type="button" onClick={() => setQuizDraft(DEFAULT_ECONOMICS_QUIZZES.map((quiz) => ({ ...quiz, choices: [...quiz.choices] as EconomicsQuiz['choices'] })))}>기본 문제 불러오기</button><button type="button" disabled={roomAction} onClick={saveEconomicsQuizzes} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 16px', fontWeight: 800 }}>문제은행·출제표 저장</button></div>
          </div>
        </section>

        <section style={card}><h3 style={{ marginTop: 0 }}>🔓 라운드별 기능 해금 설정</h3><p style={{ color: '#64748b', fontSize: '13px' }}>각 기능을 학생에게 처음 공개할 라운드를 지정합니다. 진행 중에도 이후 라운드의 조건을 조정할 수 있습니다.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '9px' }}>{[
          ['machines', '기계 구입·매각'], ['advancedEquipment', '고급 설비'], ['workerTraining', '노동자 훈련'], ['materialEfficiency', '재료 효율 개선'], ['ecoProduction', '친환경 생산'], ['loans', '은행 대출'],
        ].map(([key, label]) => <label key={key} style={{ padding: '10px', background: '#f8fafc', borderRadius: '9px' }}>{label}<input type="number" min="1" max="20" step="1" value={unlockDraft[key as keyof UnlockRounds]} onChange={(event) => setUnlockDraft((current) => ({ ...current, [key]: Math.max(1, Math.min(20, Math.floor(Number(event.target.value) || 1))) }))} style={{ width: '100%', marginTop: '6px', padding: '8px' }} /></label>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginTop: '10px', width: '100%' }}><button onClick={() => setUnlockDraft(DEFAULT_UNLOCK_ROUNDS)} disabled={roomAction} style={{ width: '100%', minHeight: '42px', padding: '9px 10px', background: '#fff', color: '#0f766e', border: '1px solid #5eead4', borderRadius: '8px', fontWeight: 800 }}>기본값으로 설정</button><button onClick={saveUnlockRounds} disabled={roomAction} style={{ width: '100%', minHeight: '42px', padding: '9px 10px', background: '#0f766e', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>해금 조건 저장</button></div></section>

        <section style={{ ...card, border: '2px solid #7c3aed', background: '#faf5ff' }}>
          <h3 style={{ marginTop: 0 }}>⚖️ 학생 기업의 시장 반영 배율</h3>
          <p style={{ color: '#6b21a8', fontSize: '13px' }}>학생 생산량 1개를 시장의 몇 개로 반영할지 정합니다. 기본 1배이며 최대 100배까지 설정할 수 있습니다.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '12px' }}>
            {activeRoom.markets.map((market) => {
              const setting = marketInfluenceDraft[market.id] || { studentSupplyWeight: market.studentSupplyWeight, demandEventEffectScale: market.demandEventEffectScale, supplyEventEffectScale: market.supplyEventEffectScale };
              const studentSupply = roundPlans.filter((plan) => plan.productId === market.id).reduce((sum, plan) => sum + plan.producedQuantity, 0);
              const activeEvent = activeRoom.demandEvents.find((event) => event.marketId === market.id);
              const demandMultiplier = scaleMarketEventFactor(activeEvent?.multiplier, EVENT_INTENSITY_SCALE[activeEvent?.demandIntensity || 'MEDIUM']);
              const supplyMultiplier = scaleMarketEventFactor(activeEvent?.supplyCurveMultiplier ?? activeEvent?.supplyMultiplier, EVENT_INTENSITY_SCALE[activeEvent?.supplyIntensity || 'MEDIUM']);
              const previewMarket = { ...market, ...setting, supplyShiftMultiplier: supplyMultiplier };
              const preview = calculateCompetitiveMarket(previewMarket, studentSupply, demandMultiplier);
              const oligopolyPreviewPrice = Math.max(10, Math.round((market.basePrice * Math.pow(demandMultiplier / supplyMultiplier, 0.5)) / 10) * 10);
              return <article key={market.id} style={{ padding: '14px', background: '#fff', border: '1px solid #d8b4fe', borderRadius: '10px' }}>
                <strong>{market.icon} {market.name}</strong>
                {market.marketType === 'PERFECT_COMPETITION' && <label style={{ display: 'block', marginTop: '10px', fontSize: '13px' }}>학생 공급 대표배율(배)
                  <input type="number" min="1" max="100" step="1" value={setting.studentSupplyWeight} onChange={(event) => setMarketInfluenceDraft((current) => ({ ...current, [market.id]: { ...setting, studentSupplyWeight: Number(event.target.value) } }))} style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
                  <input aria-label={`${market.name} 학생 공급 대표배율 슬라이더`} type="range" min="1" max="100" step="1" value={setting.studentSupplyWeight} onChange={(event) => setMarketInfluenceDraft((current) => ({ ...current, [market.id]: { ...setting, studentSupplyWeight: Number(event.target.value) } }))} style={{ marginTop: '10px' }} />
                </label>}
                <div style={{ marginTop: '10px', padding: '9px', background: '#f5f3ff', borderRadius: '8px', fontSize: '13px', lineHeight: 1.7 }}>
                  {market.marketType === 'PERFECT_COMPETITION' && <><span style={{ display: 'block' }}>학생 실제 총공급 <b style={{ float: 'right' }}>{studentSupply.toLocaleString()}</b></span>
                  <span style={{ display: 'block' }}>시장에 반영되는 공급 <b style={{ float: 'right' }}>{preview.effectiveStudentSupply.toLocaleString()}</b></span>
                  <span style={{ display: 'block' }}>학생 공급이 없을 때 <b style={{ float: 'right' }}>{Math.round(preview.priceWithoutStudentSupply).toLocaleString()}원</b></span></>}
                  <span style={{ display: 'block', color: '#7c3aed' }}>현재 설정 예상가격 <b style={{ float: 'right' }}>{(market.marketType === 'PERFECT_COMPETITION' ? preview.marketPrice : oligopolyPreviewPrice).toLocaleString()}원</b></span>
                </div>
              </article>;
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}><button onClick={resetMarketInfluence} disabled={roomAction} style={{ padding: '10px 15px', background: '#fff', color: '#6b21a8', border: '1px solid #c4b5fd', borderRadius: '8px', fontWeight: 800 }}>모두 1배로 설정</button><button onClick={saveMarketInfluence} disabled={roomAction} style={{ padding: '10px 15px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>대표배율 저장</button></div>
        </section>

        <section className="teacher-demand-events" style={{ ...card, border: '2px solid #d97706', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
            <div><h3 style={{ margin: 0 }}>📰 다음 시장 신문 준비(선택)</h3><p style={{ margin: '6px 0', color: '#92400e', fontSize: '13px' }}>몇 라운드마다 충격을 주고 싶을 때만 발행하세요. 발행하지 않으면 다음 라운드는 자동으로 ‘변화 없음’이 적용됩니다.</p></div>
            <div className="teacher-news-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button className="news-template-button" onClick={() => { setNewsTemplateDraft((current) => mergeNewsTemplates(current)); setShowNewsTemplates(true); }}>🗂 상황별 원고 확인·편집</button><button disabled={newsGenerating || !canPrepareDemandEvents} onClick={handleRandomDemandEvents}>🎲 수요·공급 사건 무작위 선택</button><button onClick={() => setShowForecast(true)}>🔍 예측 확인</button><button disabled={newsGenerating || !canPrepareDemandEvents} onClick={handleConfirmDemandEvents} style={{ background: '#d97706', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 14px', fontWeight: 800 }}>{newsGenerating ? '기사 작성 중...' : '선택 확정·신문 발행'}</button></div>
          </div>
          {!canPrepareDemandEvents && <p role="status" style={{ padding: '10px 12px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>현재 라운드가 진행 중입니다. 판매 결과를 확정하면 다음 라운드의 수요·공급 사건과 변화 크기를 설정하고 신문을 발행할 수 있습니다.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px', marginTop: '14px' }}>{activeRoom.markets.map((market) => {
            const selectedOption = DEMAND_EVENT_OPTIONS.find((option) => option.id === (demandSelections[market.id] || 'baseline')) || DEMAND_EVENT_OPTIONS.find((option) => option.id === 'baseline')!;
            const selectedSupplyOption = DEMAND_EVENT_OPTIONS.find((option) => option.id === (supplySelections[market.id] || 'supply_baseline')) || DEMAND_EVENT_OPTIONS.find((option) => option.id === 'supply_baseline')!;
            const defaultArticle = composeEventArticle(market, selectedOption, 'CONSUMER');
            const defaultSupplyArticle = composeEventArticle(market, selectedSupplyOption, 'PRODUCTION');
            const supplyOptions = DEMAND_EVENT_OPTIONS.filter((option) => option.effectType === 'SUPPLY' && (option.id !== 'rice_typhoon' || market.id === 'market_toy'));
            return <article key={market.id} style={{ background: '#fff', padding: '13px', borderRadius: '10px', border: '1px solid #fcd34d' }}>
              <strong>{market.icon} {market.name}</strong>
              <div className="event-effect-labels"><span>{eventDirectionLabel(selectedOption, '수요')}: {selectedOption.title}</span><span>{eventDirectionLabel(selectedSupplyOption, '공급')}: {selectedSupplyOption.title}</span></div>
              <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>수요변동<select value={demandSelections[market.id] || 'baseline'} onChange={(event) => setDemandSelections((current) => ({ ...current, [market.id]: event.target.value }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{DEMAND_EVENT_OPTIONS.filter((option) => option.effectType !== 'SUPPLY').map((option) => <option key={option.id} value={option.id}>{eventOptionLabel(option, '수요')}</option>)}</select></label>
              {selectedOption.factor !== 'BASELINE' && <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>수요 효과 강도<select aria-label={`${market.name} 수요 효과 강도`} value={demandIntensities[market.id] || 'MEDIUM'} onChange={(event) => setDemandIntensities((current) => ({ ...current, [market.id]: event.target.value as EventIntensity }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{Object.entries(EVENT_INTENSITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>공급변동<select value={supplySelections[market.id] || 'supply_baseline'} onChange={(event) => setSupplySelections((current) => ({ ...current, [market.id]: event.target.value }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{supplyOptions.map((option) => <option key={option.id} value={option.id}>{eventOptionLabel(option, '공급')}</option>)}</select></label>
              {selectedSupplyOption.factor !== 'BASELINE' && <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>공급 효과 강도<select aria-label={`${market.name} 공급 효과 강도`} value={supplyIntensities[market.id] || 'MEDIUM'} onChange={(event) => setSupplyIntensities((current) => ({ ...current, [market.id]: event.target.value as EventIntensity }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{Object.entries(EVENT_INTENSITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              {selectedSupplyOption.id.startsWith('material_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 단위 재료비<input type="number" min="0" value={materialPriceDraft[market.id] || Math.round(market.materialUnitCost * market.materialCostMultiplier)} onChange={(event) => setMaterialPriceDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id.startsWith('wage_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 라운드 임금<input type="number" min="0" value={wageDraft[market.id] || market.wagePerWorker} onChange={(event) => setWageDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id.startsWith('rent_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 임대료<input type="number" min="0" value={rentDraft[market.id] || market.rentPerRound} onChange={(event) => setRentDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'producer_tax' && <label style={{ display: 'block', marginTop: '8px' }}>단위당 세금<input type="number" min="0" value={taxDraft[market.id] || 0} onChange={(event) => setTaxDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'producer_subsidy' && <label style={{ display: 'block', marginTop: '8px' }}>단위당 보조금<input type="number" min="0" value={subsidyDraft[market.id] || 0} onChange={(event) => setSubsidyDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'rice_typhoon' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}><label>피해 확률(%)<input type="number" min="0" max="100" value={disasterChanceDraft[market.id] || 40} onChange={(event) => setDisasterChanceDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label><label>피해율(%)<input type="number" min="0" max="100" value={disasterLossDraft[market.id] || 30} onChange={(event) => setDisasterLossDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label></div>}
              <details className="news-editor"><summary>✏️ 소비자·생산 원고 확인·직접 편집</summary><p style={{ color: '#64748b', fontSize: '12px' }}>수요 사건은 소비자 리포트에, 공급 사건은 생산 동향에 각각 실립니다.</p><h4>🛒 소비자 리포트</h4><label>기사 제목<input value={newsEdits[market.id]?.headline ?? defaultArticle.headline} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], headline: event.target.value } }))} /></label><label>기사 내용<textarea rows={7} value={newsEdits[market.id]?.body ?? defaultArticle.body} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], body: event.target.value } }))} /></label><h4>🏭 생산 동향</h4><label>기사 제목<input value={newsEdits[market.id]?.supplyHeadline ?? defaultSupplyArticle.headline} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], supplyHeadline: event.target.value } }))} /></label><label>기사 내용<textarea rows={7} value={newsEdits[market.id]?.supplyBody ?? defaultSupplyArticle.body} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], supplyBody: event.target.value } }))} /></label></details>
            </article>;
          })}</div>
          {newsMessage && <p role="status" style={{ padding: '10px 12px', margin: '12px 0 0', borderRadius: '8px', background: newsMessage.includes('발행되었습니다') ? '#dcfce7' : '#fee2e2', color: newsMessage.includes('발행되었습니다') ? '#166534' : '#991b1b', fontWeight: 700 }}>{newsMessage}</p>}
          {activeRoom.pendingDemandEvents.length > 0 && <div style={{ marginTop: '16px' }}><strong>발행된 신문 미리보기</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '10px', marginTop: '9px' }}>{activeRoom.pendingDemandEvents.map((event) => { const market = activeRoom.markets.find((item) => item.id === event.marketId); return <article key={event.marketId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px' }}><small style={{ color: '#92400e', fontWeight: 800 }}>{market?.icon} {market?.name} · 교사용 정답: 수요 {event.title} ({EVENT_INTENSITY_LABEL[event.demandIntensity || 'MEDIUM']}) / 공급 {event.supplyTitle || '변화 없음'} ({EVENT_INTENSITY_LABEL[event.supplyIntensity || 'MEDIUM']})</small><h4 style={{ margin: '7px 0' }}>{event.articleHeadline}</h4><p style={{ margin: 0, color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>{event.articleBody}</p><small style={{ display: 'block', marginTop: '8px', color: '#94a3b8' }}>{event.generatedBy === 'AI' ? 'AI 작성' : '자동 템플릿 작성'}</small></article>; })}</div></div>}
        </section>

        {showForecast && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="market-forecast-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForecast(false); }}><section className="teacher-forecast-modal" style={{ ...card, border: '2px solid #d97706' }}><div className="teacher-modal-heading"><h3 id="market-forecast-title" style={{ margin: 0 }}>🔍 선택 사건 적용 결과 예측</h3><button type="button" onClick={() => setShowForecast(false)} aria-label="예측 확인 닫기">✕</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '9px' }}>{eventForecasts.map(({ market, option, supplyOption, price, demand, materialCost, wage, productivity }) => <article key={market.id} style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '9px', padding: '12px' }}><strong>{market.icon} {market.name}</strong><small style={{ display: 'block', color: '#9a3412', margin: '4px 0 7px' }}>수요: {option.title} ({EVENT_INTENSITY_LABEL[demandIntensities[market.id] || 'MEDIUM']})<br />공급: {supplyOption.title} ({EVENT_INTENSITY_LABEL[supplyIntensities[market.id] || 'MEDIUM']})</small><span style={{ display: 'block' }}>시장가격 <b style={{ float: 'right' }}>{market.announcedPrice.toLocaleString()}원 → {price.toLocaleString()}원</b></span><span style={{ display: 'block' }}>기준수요 <b style={{ float: 'right' }}>{market.demandAtBasePrice.toLocaleString()} → {demand.toLocaleString()}</b></span><span style={{ display: 'block' }}>단위 재료비 <b style={{ float: 'right' }}>{materialCost.toLocaleString()}원</b></span><span style={{ display: 'block' }}>1명당 임금 <b style={{ float: 'right' }}>{wage.toLocaleString()}원</b></span><span style={{ display: 'block' }}>첫 노동자 생산성 <b style={{ float: 'right' }}>{productivity}</b></span></article>)}</div></section></div>}

        {showNewsTemplates && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="news-template-title"><section className="teacher-news-templates" style={{ ...card, border: '2px solid #d97706' }}><div className="teacher-modal-heading"><h3 id="news-template-title" style={{ margin: 0 }}>🗂 상황별 신문기사 편집</h3><button type="button" onClick={() => setShowNewsTemplates(false)} aria-label="상황별 신문기사 닫기">✕</button></div><p style={{ color: '#64748b', fontSize: '13px' }}>각 사건에 사용할 신문식 기본 원고입니다. 수정해 저장하면 이후 기사 발행 시 수정본을 우선 사용합니다.</p><div style={{ display: 'grid', gap: '10px' }}>{DEMAND_EVENT_OPTIONS.filter((option) => !['baseline', 'supply_baseline'].includes(option.id)).map((option) => { const draft = newsTemplateDraft[option.id] || DEFAULT_NEWS_TEMPLATES[option.id]; return <details key={option.id} className="news-editor"><summary>{option.effectType === 'SUPPLY' ? '공급' : '수요'} · {option.title}{option.temporary ? ' (일시 충격)' : ''}</summary><label>제목<input value={draft.headline} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [option.id]: { ...draft, headline: event.target.value } }))} /></label><label>내용<textarea rows={9} value={draft.body} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [option.id]: { ...draft, body: event.target.value } }))} /></label></details>; })}</div><button onClick={async () => { if (!activeRoom) return; const templates = { ...DEFAULT_NEWS_TEMPLATES, ...newsTemplateDraft }; await roomService.updateNewsTemplates(activeRoom.id, templates); setNewsTemplateDraft(templates); alert('상황별 신문기사를 저장했습니다.'); }} style={{ marginTop: '12px' }}>상황별 기사 저장</button></section></div>}

        <section className="teacher-markets" style={card}><h3 style={{ marginTop: 0 }}>📊 동시에 개설된 시장과 공개가격</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>{marketStats.map((market) =>
            <div key={market.id} style={{ padding: '16px', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '12px' }}>
              <span style={{ fontSize: '28px' }}>{market.icon}</span><strong style={{ display: 'block' }}>{market.name}</strong><b style={{ color: '#dc2626', fontSize: '19px' }}>{market.priceControl === 'FIRM_PRICE' ? '시장 기준가격' : '시장가격'} {market.announcedPrice.toLocaleString()}원</b><div style={{ marginTop: '6px', color: '#7c3aed', fontSize: '12px', fontWeight: 700 }}>수요 변화: {market.demandEvent?.title || '기준 수요'}</div>
              <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid #bfdbfe', display: 'grid', gap: '4px', fontSize: '13px' }}><span>진입 기업 <b style={{ float: 'right' }}>{market.companyCount}개사</b></span><span>Round {activeRoom.currentRound} 총생산 <b style={{ float: 'right' }}>{market.totalSupply.toLocaleString()}개</b></span>{market.result ? <><span>실제 시장가격 <b style={{ float: 'right', color: '#dc2626' }}>{market.result.marketPrice === null ? '거래 없음' : `${market.result.marketPrice.toLocaleString()}원`}</b></span><span>실제 거래량 <b style={{ float: 'right', color: '#2563eb' }}>{market.result.tradedQuantity.toLocaleString()}개</b></span></> : <span>예상 시장매출 <b style={{ float: 'right' }}>{market.expectedMarketSales.toLocaleString()}원</b></span>}</div>
              <small style={{ display: 'block', color: '#64748b', marginTop: '7px' }}>{market.description}</small>
            </div>)}</div>
        </section>

        <section className="teacher-curves" style={card}><h3 style={{ marginTop: 0 }}>📉 전체 시장 수요·공급곡선</h3><p style={{ color: '#64748b', fontSize: '13px' }}>가격수용 시장의 전체 수요곡선과 전체 공급곡선만 표시합니다. 스마트폰 과점시장에는 하나의 공급곡선을 적용하지 않습니다.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '18px' }}>{activeRoom.markets.filter((market) => market.marketType === 'PERFECT_COMPETITION').map((market) => { const event = activeRoom.demandEvents.find((item) => item.marketId === market.id); const demandMultiplier = scaleMarketEventFactor(event?.multiplier, EVENT_INTENSITY_SCALE[event?.demandIntensity || 'MEDIUM']); return <MarketCurveChart key={market.id} market={market} plans={[]} demandMultiplier={demandMultiplier} />; })}</div></section>

        <section className={`teacher-company-comparison ${activeRoom.roundPhase === 'RESULT' ? 'is-settled' : ''}`} style={{ ...card, gridColumn: '1 / -1' }}><h3 style={{ marginTop: 0 }}>📋 Round {activeRoom.currentRound} 학생 기업 비교 현황판</h3><p style={{ color: '#64748b', fontSize: '13px' }}>{activeRoom.roundPhase === 'RESULT' ? '라운드가 마감되어 실제 판매량·매출·이윤을 비교합니다.' : '현재 제출된 생산계획의 확정 고용·설비·비용과 전량 판매 가정 예상치를 비교합니다.'}</p><div style={{ overflowX: 'auto' }}><table><thead><tr><th>기업</th><th>시장</th><th>퀴즈</th><th>확정 고용</th><th>확정 기계</th><th>생산/판매희망</th><th>한계생산</th><th>평균비용</th><th>한계비용</th><th>{activeRoom.roundPhase === 'RESULT' ? '실제 판매' : '예상 매출'}</th><th>{activeRoom.roundPhase === 'RESULT' ? '실제 이윤' : '예상 이윤'}</th><th>현금</th><th>상세</th></tr></thead><tbody>{companies.map((company) => { const companyPlan = roundPlans.find((item) => item.companyId === company.id); const averageCost = companyPlan ? Math.round((companyPlan.productionCost + (companyPlan.allocatedInvestmentCost || 0)) / Math.max(1, companyPlan.producedQuantity)) : null; const expectedRevenue = companyPlan ? (companyPlan.offeredQuantity ?? companyPlan.producedQuantity) * (companyPlan.askingPrice || companyPlan.announcedPrice) : 0; const expectedProfit = companyPlan ? expectedRevenue - companyPlan.productionCost - (companyPlan.allocatedInvestmentCost || 0) : 0; const settled = companyPlan?.settlementStatus === 'SETTLED'; return <tr key={company.id}><td><strong>{company.name}</strong></td><td>{companyPlan?.marketName || '-'}</td><td>{company.quizCompletedRounds?.includes(activeRoom.currentRound) ? '완료' : '미완료'}</td><td>{companyPlan ? `${companyPlan.workerCount}명` : '-'}</td><td>{companyPlan ? `${companyPlan.machineCountAfter}대` : '-'}</td><td>{companyPlan ? `${companyPlan.producedQuantity.toLocaleString()}/${(companyPlan.offeredQuantity ?? companyPlan.producedQuantity).toLocaleString()}` : '-'}</td><td>{companyPlan ? `${companyPlan.marginalProduct.toFixed(2)}` : '-'}</td><td>{averageCost === null ? '-' : `${averageCost.toLocaleString()}원`}</td><td>{companyPlan?.marginalCost == null ? '-' : `${companyPlan.marginalCost.toLocaleString()}원`}</td><td>{companyPlan ? settled ? `${(companyPlan.soldQuantity || 0).toLocaleString()}` : `${expectedRevenue.toLocaleString()}원` : '-'}</td><td className={(settled ? (companyPlan?.economicProfit || 0) : expectedProfit) >= 0 ? 'positive' : 'negative'}>{companyPlan ? `${(settled ? companyPlan.economicProfit || 0 : expectedProfit).toLocaleString()}원` : '-'}</td><td>{company.cash.toLocaleString()}원</td><td><button onClick={() => setSelectedCompanyId(company.id)}>보기</button></td></tr>; })}</tbody></table></div></section>

        {selectedCompany && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="company-status-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCompanyId(null); }}><section className="teacher-company-status-modal" style={{ ...card, border: '2px solid #2563eb' }}><div className="teacher-modal-heading"><h3 id="company-status-title" style={{ margin: 0 }}>🔎 {selectedCompany.name} 전체 상황</h3><button type="button" onClick={() => setSelectedCompanyId(null)} aria-label="기업 상황 닫기">✕</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '9px' }}><span>업종 경험 <b style={{ float: 'right' }}>{selectedCompany.industryTraitIcon} {selectedCompany.industryTraitName || '선택 전'}</b></span><span>자본금 <b style={{ float: 'right' }}>{selectedCompany.cash.toLocaleString()}원</b></span><span>대출잔액 <b style={{ float: 'right' }}>{(selectedCompany.loanBalance || 0).toLocaleString()}원</b></span><span>현재 노동자 <b style={{ float: 'right' }}>{selectedCompany.employeeCount || 1}명</b></span><span>현재 보유 기계 <b style={{ float: 'right' }}>{selectedCompany.machineCount || 1}대</b></span><span>이번 라운드 퀴즈 <b style={{ float: 'right' }}>{selectedCompany.quizCompletedRounds?.includes(activeRoom.currentRound) ? '완료' : '미완료'}</b></span>{UPGRADE_OPTIONS.map((upgrade) => <span key={upgrade.id}>{upgrade.icon} {upgrade.name}<b style={{ float: 'right' }}>Lv.{selectedCompany.upgrades?.[upgrade.id] || 0}</b></span>)}</div>{selectedCompanyPlan ? <div style={{ marginTop: '12px', padding: '12px', background: '#eff6ff', borderRadius: '9px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '8px' }}><span>선택시장 <b style={{ float: 'right' }}>{selectedCompanyPlan.marketName}</b></span><span>확정 고용 <b style={{ float: 'right' }}>{selectedCompanyPlan.workerCount}명</b></span><span>확정 기계 <b style={{ float: 'right' }}>{selectedCompanyPlan.machineCountAfter}대</b></span><span>생산/판매희망 <b style={{ float: 'right' }}>{selectedCompanyPlan.producedQuantity}/{selectedCompanyPlan.offeredQuantity ?? selectedCompanyPlan.producedQuantity}</b></span><span>한계생산 <b style={{ float: 'right' }}>{selectedCompanyPlan.marginalProduct.toFixed(2)}</b></span><span>한계비용 <b style={{ float: 'right' }}>{selectedCompanyPlan.marginalCost?.toLocaleString() || '-'}원</b></span><span>생산비 <b style={{ float: 'right' }}>{selectedCompanyPlan.productionCost.toLocaleString()}원</b></span><span>매출 <b style={{ float: 'right' }}>{(selectedCompanyPlan.revenue || 0).toLocaleString()}원</b></span><span>이윤 <b style={{ float: 'right' }}>{(selectedCompanyPlan.economicProfit ?? selectedCompanyPlan.profit ?? 0).toLocaleString()}원</b></span></div> : <p style={{ color: '#64748b' }}>이번 라운드 생산계획을 아직 제출하지 않았습니다.</p>}<div className="teacher-student-roster"><h4>👥 학생 명단</h4>{(selectedCompany.studentMembers || []).length ? <ul>{(selectedCompany.studentMembers || []).map((member, index) => <li key={`${member.studentNumber}-${index}`}>{member.studentNumber} · {member.name}</li>)}</ul> : <p>등록된 학생 명단이 없습니다.</p>}<button onClick={() => window.open(`/student?roomId=${encodeURIComponent(selectedCompany.roomId)}&name=${encodeURIComponent(selectedCompany.name)}&readonly=1`, '_blank')}>읽기 전용 학생 기업화면 열기</button></div></section></div>}

        {activeRoom.currentRound % 3 === 0 && <section style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa' }}><h3 style={{ marginTop: 0 }}>📝 1년 경제 활동지 ({reflections.length}/{companies.length})</h3>{reflections.length === 0 ? <p style={{ color: '#64748b' }}>아직 제출된 활동지가 없습니다.</p> : <div style={{ display: 'grid', gap: '10px' }}>{reflections.map((reflection) => <details key={reflection.id} style={{ background: '#fff', padding: '12px', borderRadius: '9px' }}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>{reflection.companyName}</summary><p><b>한계생산물·한계비용:</b> {reflection.marginalProductObservation}</p><p><b>시장 변화:</b> {reflection.marketChangeObservation}</p><p><b>다음 전략:</b> {reflection.nextStrategy}</p></details>)}</div>}</section>}

        <section className="teacher-confirmation-status" style={card}><h3 style={{ marginTop: 0 }}>✅ 생산확정 현황 ({roundPlans.length}/{companies.length})</h3><div style={{ display: 'grid', gap: '8px' }}>{companies.map((company) => { const submitted = roundPlans.some((plan) => plan.companyId === company.id); return <button key={company.id} onClick={() => setSelectedCompanyId(company.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px' }}><span>{company.name}</span><strong style={{ color: submitted ? '#059669' : '#dc2626' }}>{submitted ? '생산확정' : '미확정'}</strong></button>; })}</div></section>

        <section className="teacher-companies" style={card}><h3 style={{ marginTop: 0 }}>🏢 접속 기업 ({companies.length}개사)</h3>
          {companies.length === 0 ? <p style={{ color: '#64748b' }}>학생들에게 룸 코드 {activeRoom.id}를 안내해주세요.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>회사</th><th>업종 경험</th><th>자본금</th><th>노동자</th><th>기계</th><th>업그레이드</th><th>관리</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} style={{ borderTop: '1px solid #e2e8f0', textAlign: 'center' }}><td style={{ padding: '12px' }}>{company.name}</td><td>{company.traitsConfirmed ? `${company.industryTraitIcon || ''} ${company.industryTraitName || '-'}` : '선택 전'}</td><td>{company.cash.toLocaleString()}원</td><td>{company.employeeCount || 1}명</td><td>{company.machineCount || 1}대</td><td>총 Lv.{Object.values(company.upgrades || {}).reduce((sum, level) => sum + level, 0)}</td><td><button onClick={() => setSelectedCompanyId(company.id)}>상황 보기</button> <button disabled={companyActionId === company.id} onClick={() => handleRenameCompany(company)}>팀명 수정</button> <button disabled={companyActionId === company.id} onClick={() => handleDeleteCompany(company)} style={{ color: '#dc2626' }}>삭제</button></td></tr>)}</tbody></table></div>}
        </section>
      </div>}
    </main>
  </div>;
};
