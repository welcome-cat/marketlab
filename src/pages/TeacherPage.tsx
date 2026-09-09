import { transitionMarkets, withRecoveryNews } from '../services/roomService';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateMarketClearing, companyService, productionService, reflectionService, roomService, scaleMarketEventFactor } from '../services';
import type { Company, DemandEvent, EconomicsQuiz, EventIntensity, LearningReflection, MarketRoundResult, ProductionPlan, Room, UnlockRounds } from '../types/domain';
import { DEFAULT_ECONOMICS_QUIZZES, DEFAULT_REFLECTION_SHEETS, DEFAULT_UNLOCK_ROUNDS, DEMAND_EVENT_OPTIONS, EVENT_INTENSITY_LABEL, EVENT_INTENSITY_SCALE, MARKETS, UPGRADE_OPTIONS } from '../types/domain';
import { MarketCurveChart } from '../components/MarketCurveChart';
import { StudentRosterEditor } from '../components/StudentRosterEditor';
import { ReflectionSettings } from '../components/ReflectionSettings';
import { composeEventArticle, defaultNewsTemplates, getRecoveryMessage, RECOVERY_TEMPLATE_OPTIONS } from '../services/newsService';

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
  const [profitVisibleKey, setProfitVisibleKey] = useState('');
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
  const [publishedNewsKey, setPublishedNewsKey] = useState<string | null>(null);
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
  const [newsTemplateTab, setNewsTemplateTab] = useState<'EVENTS' | 'RECOVERY'>('EVENTS');
  const [showReflectionSettings, setShowReflectionSettings] = useState(false);
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
      const demandEvents: DemandEvent[] = MARKETS.map((market) => ({
        marketId: market.id,
        optionId: 'baseline',
        factor: 'BASELINE',
        effectType: 'DEMAND',
        title: '수요 변화 없음',
        description: '특별한 수요 변화 요인이 없습니다.',
        multiplier: 1,
        articleHeadline: DEFAULT_NEWS_TEMPLATES.baseline?.headline || `${market.name}, 평온한 흐름 이어져`,
        articleBody: DEFAULT_NEWS_TEMPLATES.baseline?.body || '관련 업계에서는 최근 소비 환경에 뚜렷한 변화가 관찰되지 않고 있다고 전했습니다.',
        supplyOptionId: 'supply_baseline',
        supplyFactor: 'BASELINE',
        supplyTitle: '공급 변화 없음',
        supplyDescription: '특별한 공급 변화 요인이 없습니다.',
        supplyArticleHeadline: DEFAULT_NEWS_TEMPLATES.supply_baseline?.headline || `${market.name} 생산 현장, 평소 흐름 이어져`,
        supplyArticleBody: DEFAULT_NEWS_TEMPLATES.supply_baseline?.body || '특별한 공급 변화 요인이 없습니다.',
        generatedBy: 'TEMPLATE',
      }));
      setActiveRoom({ id: roomId.trim(), title: title.trim(), markets: MARKETS, currentRound: 1, status: 'WAITING', roundPhase: 'DECISION', demandEvents, pendingDemandEvents: [], unlockRounds: DEFAULT_UNLOCK_ROUNDS, economicsQuizzes: DEFAULT_ECONOMICS_QUIZZES, reflectionInterval: 3, reflectionSheets: DEFAULT_REFLECTION_SHEETS, createdAt: Date.now() });
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
    setNewsEdits({});
    setNewsMessage(null);
    setPublishedNewsKey(null);
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

  const draftEvents: DemandEvent[] = activeRoom ? activeRoom.markets.map((market): DemandEvent => {
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
      }) : [];

  const publicationEvents = withRecoveryNews(draftEvents, activeRoom?.status === 'RUNNING' ? activeRoom.demandEvents : [], newsTemplateDraft);
  const publicationKey = JSON.stringify([activeRoom?.id, activeRoom?.currentRound, publicationEvents, marketInfluenceDraft]);
  const matchesSavedNews = publicationEvents.length > 0 && publicationEvents.length === activeRoom?.pendingDemandEvents.length && publicationEvents.every(event => {
    const saved = activeRoom.pendingDemandEvents.find(item => item.marketId === event.marketId);
    return saved && Object.entries(event).every(([key, value]) => saved[key as keyof DemandEvent] === value);
  });
  const isNewsPublished = publishedNewsKey === publicationKey || matchesSavedNews;
  const handleConfirmDemandEvents = async () => {
    if (!activeRoom || newsGenerating || isNewsPublished) return;
    if (!canPrepareDemandEvents) {
      setNewsMessage('신문은 수업 시작 전 또는 현재 라운드의 거래 결과가 확정된 뒤에만 발행할 수 있습니다.');
      return;
    }
    try {
      setNewsGenerating(true);
      setNewsMessage(null);
      const events = publicationEvents;
      await roomService.updateMarketInfluence(activeRoom.id, marketInfluenceDraft);
      await roomService.confirmDemandEvents(activeRoom.id, events);
      setPublishedNewsKey(publicationKey);
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

  const eventForecasts = activeRoom?.markets.map((market) => {
    const option = DEMAND_EVENT_OPTIONS.find((item) => item.id === (demandSelections[market.id] || 'baseline')) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'baseline')!;
    const supplyOption = DEMAND_EVENT_OPTIONS.find((item) => item.id === (supplySelections[market.id] || 'supply_baseline')) || DEMAND_EVENT_OPTIONS.find((item) => item.id === 'supply_baseline')!;
    const supplyScale = EVENT_INTENSITY_SCALE[supplyIntensities[market.id] || 'MEDIUM'];
    const forecastMarket = transitionMarkets(activeRoom, [{
      ...activeRoom.demandEvents.find(event => event.marketId === market.id)!,
      marketId: market.id, optionId: option.id, supplyOptionId: supplyOption.id,
      multiplier: option.multiplier, effectType: 'DEMAND',
      demandIntensity: demandIntensities[market.id] || 'MEDIUM',
      supplyIntensity: supplyIntensities[market.id] || 'MEDIUM',
      supplyCurveMultiplier: supplyOption.supplyMultiplier || 1,
      producerTaxPerUnit: supplyOption.id === 'producer_tax' ? taxDraft[market.id] || 0 : 0,
      producerSubsidyPerUnit: supplyOption.id === 'producer_subsidy' ? subsidyDraft[market.id] || 0 : 0,
    }]).find(item => item.id === market.id)!;
    return {
      market,
      option,
      supplyOption,
      price: forecastMarket.announcedPrice,
      demand: Math.round(forecastMarket.demandAtBasePrice),
      materialCost: supplyOption.id.startsWith('material_') && materialPriceDraft[market.id] ? materialPriceDraft[market.id] : Math.round(market.materialUnitCost * market.materialCostMultiplier * scaleMarketEventFactor(supplyOption.materialMultiplier, supplyScale)),
      wage: supplyOption.id.startsWith('wage_') && wageDraft[market.id] ? wageDraft[market.id] : Math.round(market.wagePerWorker * scaleMarketEventFactor(supplyOption.wageMultiplier, supplyScale)),
      productivity: Math.round(market.firstWorkerProductivity * scaleMarketEventFactor(supplyOption.productivityMultiplier, supplyScale) * 100) / 100,
    };
  }) || [];

  const profitKey = `${activeRoom?.id}:${activeRoom?.currentRound}`;
  const showProfits = profitVisibleKey === profitKey;
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
  const sellingProgress = activeRoom?.roundPhase === 'SELLING' ? Math.max(0, Math.min(1, (clock - (activeRoom.sellingStartedAt || clock)) / 30000)) : (activeRoom?.roundPhase === 'RESULT' ? 1 : 0);
  const sellingMonth = Math.min(4, Math.max(1, Math.ceil(sellingProgress * 4)));

  const liveClearingMap = React.useMemo(() => {
    if (!activeRoom) return new Map();
    const map = new Map();
    for (const market of activeRoom.markets) {
      const marketPlans = roundPlans.filter((p) => p.productId === market.id);
      const activeEvent = activeRoom.demandEvents.find((e) => e.marketId === market.id);
      const demandMultiplier = 1;
      const clearing = calculateMarketClearing(market, marketPlans, demandMultiplier, activeEvent?.ecoPreferenceBoost || 0);
      map.set(market.id, clearing);
    }
    return map;
  }, [activeRoom, roundPlans]);

  const companyLiveSales = React.useMemo(() => {
    if (!activeRoom) return [];
    return companies.map((company) => {
      const plan = roundPlans.find((p) => p.companyId === company.id);
      if (!plan) {
        return {
          company,
          plan: null,
          market: null,
          askingPrice: 0,
          plannedQuantity: 0,
          liveSoldQuantity: 0,
          liveRevenue: 0,
          progressRate: 0,
          status: '미제출',
        };
      }
      const market = activeRoom.markets.find((m) => m.id === plan.productId);
      const clearing = liveClearingMap.get(plan.productId);
      const projectedSold = clearing?.soldByPlan.get(plan.id) || 0;
      const plannedQuantity = plan.offeredQuantity ?? plan.producedQuantity;
      const askingPrice = plan.askingPrice || plan.announcedPrice || market?.announcedPrice || 0;
      const refPrice = market?.announcedPrice || askingPrice;
      const priceGapRate = (refPrice - askingPrice) / Math.max(1, refPrice);
      const salesPace = priceGapRate >= 0 ? 1 + Math.min(0.8, priceGapRate * 2) : Math.max(0.25, 1 + priceGapRate * 2);
      const liveSold = Math.min(projectedSold, Math.floor(projectedSold * Math.min(1, sellingProgress * salesPace)));
      const liveRev = liveSold * askingPrice;
      const progressRate = plannedQuantity > 0 ? Math.min(100, Math.round((liveSold / plannedQuantity) * 100)) : 0;
      return {
        company,
        plan,
        market,
        askingPrice,
        plannedQuantity,
        liveSoldQuantity: liveSold,
        liveRevenue: liveRev,
        progressRate,
        status: progressRate >= 100 ? '완판' : liveSold > 0 ? '판매 중' : '대기',
      };
    });
  }, [activeRoom, companies, roundPlans, liveClearingMap, sellingProgress]);

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

        {activeRoom.roundPhase === 'SELLING' && <section className="teacher-live-sales-dashboard" style={{ ...card, border: '2px solid #7c3aed', background: '#faf5ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#7c3aed' }}>LIVE SALES DASHBOARD</span>
              <h3 style={{ margin: '3px 0', fontSize: '20px', color: '#581c87' }}>🛒 Round {activeRoom.currentRound} 실시간 4개월 판매 현황</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ padding: '6px 12px', borderRadius: '8px', background: '#7c3aed', color: '#fff', fontSize: '14px', fontWeight: 800 }}>
                ⏱️ 판매 중: {sellingSecondsLeft > 0 ? `${sellingSecondsLeft}초 남음` : '마감됨'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', margin: '14px 0 10px' }}>
            {[1, 2, 3, 4].map((month) => (
              <div key={month} style={{ padding: '10px 6px', textAlign: 'center', borderRadius: '10px', background: month <= sellingMonth ? '#7c3aed' : '#e9d5ff', color: month <= sellingMonth ? '#fff' : '#6b21a8', fontWeight: 800, fontSize: '14px', transition: 'all 0.3s' }}>
                {month}개월 차 {month === sellingMonth && '🔥'}
              </div>
            ))}
          </div>
          <progress value={sellingProgress} max={1} style={{ width: '100%', height: '10px', borderRadius: '5px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '10px', marginTop: '16px' }}>
            {activeRoom.markets.map((market) => {
              const marketSales = companyLiveSales.filter((item) => item.market?.id === market.id);
              const totalSold = marketSales.reduce((sum, item) => sum + item.liveSoldQuantity, 0);
              const totalPlanned = marketSales.reduce((sum, item) => sum + item.plannedQuantity, 0);
              const totalRev = marketSales.reduce((sum, item) => sum + item.liveRevenue, 0);
              return (
                <div key={market.id} style={{ background: '#fff', border: '1px solid #d8b4fe', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{market.icon} {market.name}</strong>
                    <span style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 700 }}>{marketSales.length}개사</span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '13px', display: 'grid', gap: '4px' }}>
                    <span>실시간 판매량: <b style={{ float: 'right', color: '#7c3aed' }}>{totalSold.toLocaleString()} / {totalPlanned.toLocaleString()}</b></span>
                    <span>실시간 판매수입: <b style={{ float: 'right', color: '#16a34a' }}>{totalRev.toLocaleString()}원</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ overflowX: 'auto', marginTop: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #d8b4fe', padding: '14px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '15px' }}>🏢 학생 기업별 실시간 판매 추이</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f5f3ff', color: '#581c87', borderBottom: '1px solid #e9d5ff' }}>
                  <th style={{ padding: '8px' }}>기업</th>
                  <th>선택 시장</th>
                  <th>희망가격</th>
                  <th>판매대상</th>
                  <th>실시간 판매량</th>
                  <th>실시간 판매수입</th>
                  <th>소진율</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {companyLiveSales.map(({ company, market, askingPrice, plannedQuantity, liveSoldQuantity, liveRevenue, progressRate, status }) => (
                  <tr key={company.id} style={{ borderBottom: '1px solid #f3e8ff' }}>
                    <td style={{ padding: '9px', fontWeight: 700 }}>{company.name}</td>
                    <td>{market ? `${market.icon} ${market.name}` : '-'}</td>
                    <td>{askingPrice ? `${askingPrice.toLocaleString()}원` : '-'}</td>
                    <td>{plannedQuantity.toLocaleString()}</td>
                    <td style={{ color: '#7c3aed', fontWeight: 800 }}>{liveSoldQuantity.toLocaleString()}</td>
                    <td style={{ color: '#16a34a', fontWeight: 800 }}>{liveRevenue.toLocaleString()}원</td>
                    <td style={{ minWidth: '100px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                        <progress value={progressRate} max={100} style={{ width: '60px', height: '8px' }} />
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{progressRate}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, background: status === '완판' ? '#dcfce7' : status === '판매 중' ? '#fef3c7' : '#f1f5f9', color: status === '완판' ? '#166534' : status === '판매 중' ? '#92400e' : '#475569' }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>}

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

        <section style={card}><h3>시장가격 결정 방식</h3><p>카페·쌀·운동화는 시장 전체 수요·공급으로 가격이 결정됩니다. 학생 판매량은 시장가격을 바꾸지 않습니다. 스마트폰 시장은 진입 기업 수에 따라 가격이 달라집니다.</p></section>

        <section className="teacher-demand-events" style={{ ...card, border: '2px solid #d97706', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
            <div><h3 style={{ margin: 0 }}>📰 다음 시장 신문 준비(선택)</h3><p style={{ margin: '6px 0', color: '#92400e', fontSize: '13px' }}>몇 라운드마다 충격을 주고 싶을 때만 발행하세요. 발행하지 않으면 다음 라운드는 자동으로 ‘변화 없음’이 적용됩니다.</p></div>
            <div className="teacher-news-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button className="news-template-button" onClick={() => { setNewsTemplateDraft((current) => mergeNewsTemplates(current)); setShowNewsTemplates(true); }}>🗂 상황별 원고 확인·편집</button><button disabled={newsGenerating || !canPrepareDemandEvents} onClick={handleRandomDemandEvents}>🎲 수요·공급 사건 무작위 선택</button><button onClick={() => setShowForecast(true)}>🔍 예측 확인</button><button disabled={newsGenerating || isNewsPublished || !canPrepareDemandEvents} onClick={handleConfirmDemandEvents} style={{ background: '#d97706', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 14px', fontWeight: 800 }}>{newsGenerating ? '발행 중...' : isNewsPublished ? '✓ 발행 완료' : '선택 확정·신문 발행'}</button></div>
          {newsMessage && (!newsMessage.includes('발행되었습니다') || isNewsPublished) && <p role="status" style={{ padding: '10px 12px', margin: '12px 0 0', borderRadius: '8px', background: newsMessage.includes('발행되었습니다') ? '#dcfce7' : '#fee2e2', color: newsMessage.includes('발행되었습니다') ? '#166534' : '#991b1b', fontWeight: 700 }}>{newsMessage}</p>}
          <p role="status" style={{ color: '#92400e', fontSize: '13px' }}>{isNewsPublished ? '학생 신문에 반영되었습니다. 사건이나 원고를 수정하면 다시 발행할 수 있습니다.' : '아래 내용은 발행 전 초안입니다. 발행 버튼을 눌러야 학생 신문에 반영됩니다.'}</p>
          </div>
          {!canPrepareDemandEvents && <p role="status" style={{ padding: '10px 12px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>현재 라운드가 진행 중입니다. 판매 결과를 확정하면 다음 라운드의 수요·공급 사건과 변화 크기를 설정하고 신문을 발행할 수 있습니다.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px', marginTop: '14px' }}>{activeRoom.markets.map((market) => {
            const selectedOption = DEMAND_EVENT_OPTIONS.find((option) => option.id === (demandSelections[market.id] || 'baseline')) || DEMAND_EVENT_OPTIONS.find((option) => option.id === 'baseline')!;
            const selectedSupplyOption = DEMAND_EVENT_OPTIONS.find((option) => option.id === (supplySelections[market.id] || 'supply_baseline')) || DEMAND_EVENT_OPTIONS.find((option) => option.id === 'supply_baseline')!;

            // 지난 라운드의 단기 충격 해소 여부 확인
            const prevEvent = activeRoom.demandEvents.find((item) => item.marketId === market.id);
            const prevDemandTemp = activeRoom.status === 'RUNNING' && Boolean(DEMAND_EVENT_OPTIONS.find((o) => o.id === prevEvent?.optionId)?.temporary);
            const prevSupplyTemp = activeRoom.status === 'RUNNING' && Boolean(DEMAND_EVENT_OPTIONS.find((o) => o.id === prevEvent?.supplyOptionId)?.temporary);
            const recoveryItems: Array<{ direction: string; reason: string; headline: string; body: string }> = [];
            if (prevDemandTemp) recoveryItems.push(getRecoveryMessage(prevEvent?.optionId, prevEvent?.title, activeRoom.newsTemplates || newsTemplateDraft));
            if (prevSupplyTemp) recoveryItems.push(getRecoveryMessage(prevEvent?.supplyOptionId, prevEvent?.supplyTitle, activeRoom.newsTemplates || newsTemplateDraft));
            const hasRecovery = recoveryItems.length > 0;
            const recoverySummary = recoveryItems.map((item) => `${item.direction}: ${item.reason}`).join(' · ');
            const preview = publicationEvents.find((event) => event.marketId === market.id)!;
            const defaultArticle = { headline: preview.articleHeadline, body: preview.articleBody };
            const defaultSupplyArticle = { headline: preview.supplyArticleHeadline, body: preview.supplyArticleBody };
            const supplyOptions = DEMAND_EVENT_OPTIONS.filter((option) => option.effectType === 'SUPPLY' && (option.id !== 'rice_typhoon' || market.id === 'market_toy'));
            return <article key={market.id} style={{ background: '#fff', padding: '13px', borderRadius: '10px', border: hasRecovery ? '2px solid #f59e0b' : '1px solid #fcd34d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{market.icon} {market.name}</strong>
                {hasRecovery && <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: '999px', background: '#fef3c7', color: '#b45309' }}>🔄 정상화 예정</span>}
              </div>
              {hasRecovery && <div style={{ margin: '6px 0', padding: '6px 8px', borderRadius: '6px', background: '#fffbeb', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                <strong>단기 충격 해소:</strong> {recoverySummary}
              </div>}
              <div className="event-effect-labels"><span>{eventDirectionLabel(selectedOption, '수요')}: {selectedOption.title}</span><span>{eventDirectionLabel(selectedSupplyOption, '공급')}: {selectedSupplyOption.title}</span></div>
              <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>수요변동<select value={demandSelections[market.id] || 'baseline'} onChange={(event) => setDemandSelections((current) => ({ ...current, [market.id]: event.target.value }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{DEMAND_EVENT_OPTIONS.filter((option) => option.effectType !== 'SUPPLY').map((option) => <option key={option.id} value={option.id}>{eventOptionLabel(option, '수요')}</option>)}</select></label>
              {selectedOption.factor !== 'BASELINE' && <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>수요 효과 강도<select aria-label={`${market.name} 수요 효과 강도`} value={demandIntensities[market.id] || 'MEDIUM'} onChange={(event) => setDemandIntensities((current) => ({ ...current, [market.id]: event.target.value as EventIntensity }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{Object.entries(EVENT_INTENSITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>공급변동<select value={supplySelections[market.id] || 'supply_baseline'} onChange={(event) => setSupplySelections((current) => ({ ...current, [market.id]: event.target.value }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{supplyOptions.map((option) => <option key={option.id} value={option.id}>{eventOptionLabel(option, '공급')}</option>)}</select></label>
              {selectedSupplyOption.factor !== 'BASELINE' && <label style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>공급 효과 강도<select aria-label={`${market.name} 공급 효과 강도`} value={supplyIntensities[market.id] || 'MEDIUM'} onChange={(event) => setSupplyIntensities((current) => ({ ...current, [market.id]: event.target.value as EventIntensity }))} style={{ width: '100%', marginTop: '4px', padding: '9px' }}>{Object.entries(EVENT_INTENSITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              {selectedSupplyOption.id.startsWith('material_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 단위 재료비<input type="number" min="0" value={materialPriceDraft[market.id] || Math.round(market.materialUnitCost * market.materialCostMultiplier)} onChange={(event) => setMaterialPriceDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id.startsWith('wage_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 라운드 임금<input type="number" min="0" value={wageDraft[market.id] || market.wagePerWorker} onChange={(event) => setWageDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id.startsWith('rent_') && <label style={{ display: 'block', marginTop: '8px' }}>변경 후 {market.id === 'market_toy' ? '농지 이용료' : '임대료'}<input type="number" min="0" value={rentDraft[market.id] || market.rentPerRound} onChange={(event) => setRentDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'producer_tax' && <label style={{ display: 'block', marginTop: '8px' }}>단위당 세금<input type="number" min="0" value={taxDraft[market.id] || 0} onChange={(event) => setTaxDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'producer_subsidy' && <label style={{ display: 'block', marginTop: '8px' }}>단위당 보조금<input type="number" min="0" value={subsidyDraft[market.id] || 0} onChange={(event) => setSubsidyDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label>}
              {selectedSupplyOption.id === 'rice_typhoon' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}><label>피해 확률(%)<input type="number" min="0" max="100" value={disasterChanceDraft[market.id] || 40} onChange={(event) => setDisasterChanceDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label><label>피해율(%)<input type="number" min="0" max="100" value={disasterLossDraft[market.id] || 30} onChange={(event) => setDisasterLossDraft((current) => ({ ...current, [market.id]: Number(event.target.value) }))} style={{ width: '100%' }} /></label></div>}
              <details className="news-editor"><summary>✏️ 소비자·생산 원고 확인·직접 편집</summary><p style={{ color: '#64748b', fontSize: '12px' }}>수요 사건은 소비자 리포트에, 공급 사건은 생산 동향에 각각 실립니다.{hasRecovery ? ' (지난 라운드 단기 충격 정상화 문구가 포함되어 있습니다.)' : ''}</p><h4>🛒 소비자 리포트</h4><label>기사 제목<input value={newsEdits[market.id]?.headline ?? defaultArticle.headline} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], headline: event.target.value } }))} /></label><label>기사 내용<textarea rows={7} value={newsEdits[market.id]?.body ?? defaultArticle.body} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], body: event.target.value } }))} /></label><h4>🏭 생산 동향</h4><label>기사 제목<input value={newsEdits[market.id]?.supplyHeadline ?? defaultSupplyArticle.headline} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], supplyHeadline: event.target.value } }))} /></label><label>기사 내용<textarea rows={7} value={newsEdits[market.id]?.supplyBody ?? defaultSupplyArticle.body} onChange={(event) => setNewsEdits((current) => ({ ...current, [market.id]: { ...current[market.id], supplyBody: event.target.value } }))} /></label></details>
            </article>;
          })}</div>

          {activeRoom.pendingDemandEvents.length > 0 && <div style={{ marginTop: '16px' }}><strong>학생에게 표시되는 발행된 신문</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '10px', marginTop: '9px' }}>{activeRoom.pendingDemandEvents.map((event) => { const market = activeRoom.markets.find((item) => item.id === event.marketId); return <article key={event.marketId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px' }}><small style={{ color: '#92400e', fontWeight: 800 }}>{market?.icon} {market?.name} · 교사용 정답: 수요 {event.title} ({EVENT_INTENSITY_LABEL[event.demandIntensity || 'MEDIUM']}) / 공급 {event.supplyTitle || '변화 없음'} ({EVENT_INTENSITY_LABEL[event.supplyIntensity || 'MEDIUM']})</small><b>🛒 소비자 리포트</b><h4 style={{ margin: '7px 0' }}>{event.articleHeadline}</h4><p style={{ margin: 0, color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>{event.articleBody}</p><b>🏭 생산 동향</b><h4 style={{ margin: '7px 0' }}>{event.supplyArticleHeadline}</h4><p style={{ whiteSpace: 'pre-line', fontSize: '13px', lineHeight: 1.6 }}>{event.supplyArticleBody}</p><small style={{ display: 'block', marginTop: '8px', color: '#94a3b8' }}>{event.generatedBy === 'AI' ? 'AI 작성' : '자동 템플릿 작성'}</small></article>; })}</div></div>}
        </section>

        {showForecast && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="market-forecast-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForecast(false); }}><section className="teacher-forecast-modal" style={{ ...card, border: '2px solid #d97706' }}><div className="teacher-modal-heading"><h3 id="market-forecast-title" style={{ margin: 0 }}>🔍 선택 사건 적용 결과 예측</h3><button type="button" onClick={() => setShowForecast(false)} aria-label="예측 확인 닫기">✕</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '9px' }}>{eventForecasts.map(({ market, option, supplyOption, price, demand, materialCost, wage, productivity }) => <article key={market.id} style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '9px', padding: '12px' }}><strong>{market.icon} {market.name}</strong><small style={{ display: 'block', color: '#9a3412', margin: '4px 0 7px' }}>수요: {option.title} ({EVENT_INTENSITY_LABEL[demandIntensities[market.id] || 'MEDIUM']})<br />공급: {supplyOption.title} ({EVENT_INTENSITY_LABEL[supplyIntensities[market.id] || 'MEDIUM']})</small><span style={{ display: 'block' }}>시장가격 <b style={{ float: 'right' }}>{market.announcedPrice.toLocaleString()}원 → {price.toLocaleString()}원</b></span><span style={{ display: 'block' }}>기준수요 <b style={{ float: 'right' }}>{market.demandAtBasePrice.toLocaleString()} → {demand.toLocaleString()}</b></span><span style={{ display: 'block' }}>단위 재료비 <b style={{ float: 'right' }}>{materialCost.toLocaleString()}원</b></span><span style={{ display: 'block' }}>1명당 임금 <b style={{ float: 'right' }}>{wage.toLocaleString()}원</b></span><span style={{ display: 'block' }}>첫 노동자 생산성 <b style={{ float: 'right' }}>{productivity}</b></span></article>)}</div></section></div>}

        {showNewsTemplates && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="news-template-title"><section className="teacher-news-templates" style={{ ...card, border: '2px solid #d97706', maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto' }}><div className="teacher-modal-heading"><h3 id="news-template-title" style={{ margin: 0 }}>🗂 상황별 신문기사 편집</h3><button type="button" onClick={() => setShowNewsTemplates(false)} aria-label="상황별 신문기사 닫기">✕</button></div>
          <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
            <button type="button" onClick={() => setNewsTemplateTab('EVENTS')} style={{ padding: '8px 14px', borderRadius: '8px', border: 0, background: newsTemplateTab === 'EVENTS' ? '#d97706' : '#f1f5f9', color: newsTemplateTab === 'EVENTS' ? '#fff' : '#334155', fontWeight: 800 }}>📰 사건별 기본 원고 (27종)</button>
            <button type="button" onClick={() => setNewsTemplateTab('RECOVERY')} style={{ padding: '8px 14px', borderRadius: '8px', border: 0, background: newsTemplateTab === 'RECOVERY' ? '#d97706' : '#f1f5f9', color: newsTemplateTab === 'RECOVERY' ? '#fff' : '#334155', fontWeight: 800 }}>🔄 단기 충격 정상화·회복 원고 (9종)</button>
          </div>
          {newsTemplateTab === 'EVENTS' ? <>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>각 사건(평상시 변동 없음 포함)에 사용할 신문식 기본 원고입니다. 수정해 저장하면 이후 기사 발행 시 수정본을 우선 사용합니다.</p>
            <div style={{ display: 'grid', gap: '10px' }}>{DEMAND_EVENT_OPTIONS.map((option) => { const draft = newsTemplateDraft[option.id] || DEFAULT_NEWS_TEMPLATES[option.id]; return <details key={option.id} className="news-editor"><summary>{option.effectType === 'SUPPLY' ? '공급' : '수요'} · {option.title}{option.factor === 'BASELINE' ? ' (평상시)' : ''}{option.temporary ? ' (일시 충격)' : ''}</summary><label>제목<input value={draft.headline} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [option.id]: { ...draft, headline: event.target.value } }))} /></label><label>내용<textarea rows={7} value={draft.body} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [option.id]: { ...draft, body: event.target.value } }))} /></label></details>; })}</div>
          </> : <>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>단기 충격(일시적 유행, 소득 변화, 가격 예상 등)이 끝난 다음 라운드에 시장이 정상 수준으로 복귀할 때 신문 머리말과 본문에 합성되는 정상화 안내문입니다. 수정해 저장하면 이후 기사 발행 시 수정본을 우선 사용합니다.</p>
            <div style={{ display: 'grid', gap: '10px' }}>{RECOVERY_TEMPLATE_OPTIONS.map((item) => { const draft = newsTemplateDraft[item.templateKey] || DEFAULT_NEWS_TEMPLATES[item.templateKey]; return <details key={item.templateKey} className="news-editor"><summary>{item.effectType === 'SUPPLY' ? '공급' : '수요'} · {item.sourceEventTitle} 종료 후 정상화 ({item.defaultDirection})</summary><label>기사 머리말(요약)<input value={draft.headline} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [item.templateKey]: { ...draft, headline: event.target.value } }))} /></label><label>기사 본문(상세)<textarea rows={5} value={draft.body} onChange={(event) => setNewsTemplateDraft((current) => ({ ...current, [item.templateKey]: { ...draft, body: event.target.value } }))} /></label></details>; })}</div>
          </>}
          <button type="button" onClick={() => { if (window.confirm("편집 중인 원고를 새 2문장 기본 원고로 바꿀까요? 저장 전에는 수업에 반영되지 않습니다.")) setNewsTemplateDraft(DEFAULT_NEWS_TEMPLATES); }}>새 기본 원고로 되돌리기</button><button onClick={async () => { if (!activeRoom) return; const templates = { ...DEFAULT_NEWS_TEMPLATES, ...newsTemplateDraft }; await roomService.updateNewsTemplates(activeRoom.id, templates); setNewsTemplateDraft(templates); alert('상황별 신문기사를 저장했습니다.'); }} style={{ marginTop: '14px', background: '#d97706', color: '#fff', border: 0, borderRadius: '8px', padding: '11px 16px', fontWeight: 800 }}>상황별 기사 저장</button></section></div>}

        <section className="teacher-markets" style={card}><h3 style={{ marginTop: 0 }}>📊 동시에 개설된 시장과 공개가격</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>{marketStats.map((market) =>
            <div key={market.id} style={{ padding: '16px', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '12px' }}>
              <span style={{ fontSize: '28px' }}>{market.icon}</span><strong style={{ display: 'block' }}>{market.name}</strong><b style={{ color: '#dc2626', fontSize: '19px' }}>{market.priceControl === 'FIRM_PRICE' ? '시장 기준가격' : '시장가격'} {market.announcedPrice.toLocaleString()}원</b><div style={{ marginTop: '6px', color: '#7c3aed', fontSize: '12px', fontWeight: 700 }}>수요 변화: {market.demandEvent?.title || '기준 수요'}</div>
              <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid #bfdbfe', display: 'grid', gap: '4px', fontSize: '13px' }}><span>진입 기업 <b style={{ float: 'right' }}>{market.companyCount}개사</b></span><span>Round {activeRoom.currentRound} 총생산 <b style={{ float: 'right' }}>{market.totalSupply.toLocaleString()}개</b></span>{market.result ? <><span>실제 시장가격 <b style={{ float: 'right', color: '#dc2626' }}>{market.result.marketPrice === null ? '거래 없음' : `${market.result.marketPrice.toLocaleString()}원`}</b></span><span>실제 거래량 <b style={{ float: 'right', color: '#2563eb' }}>{market.result.tradedQuantity.toLocaleString()}개</b></span></> : <span>예상 시장매출 <b style={{ float: 'right' }}>{market.expectedMarketSales.toLocaleString()}원</b></span>}</div>
              <small style={{ display: 'block', color: '#64748b', marginTop: '7px' }}>{market.description}</small>
            </div>)}</div>
        </section>

        <section className="teacher-curves" style={card}><h3 style={{ marginTop: 0 }}>📉 전체 시장 수요·공급곡선</h3><p style={{ color: '#64748b', fontSize: '13px' }}>가격수용 시장의 전체 수요곡선과 전체 공급곡선만 표시합니다. 스마트폰 과점시장에는 하나의 공급곡선을 적용하지 않습니다.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '18px' }}>{activeRoom.markets.filter((market) => market.marketType === 'PERFECT_COMPETITION').map((market) => { const demandMultiplier = 1; return <MarketCurveChart key={market.id} market={market} plans={[]} demandMultiplier={demandMultiplier} />; })}</div></section>

        <section className={`teacher-company-comparison ${activeRoom.roundPhase === 'RESULT' ? 'is-settled' : ''}`} style={{ ...card, gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>📋 Round {activeRoom.currentRound} 학생 기업 비교 현황판 ({roundPlans.length}/{companies.length} 확정)</h3>
          <p style={{ color: '#64748b', fontSize: '13px' }}>{activeRoom.roundPhase === 'RESULT' ? '라운드가 마감되어 실제 판매량·매출·이윤을 비교합니다.' : activeRoom.roundPhase === 'SELLING' ? '30초(4개월) 판매가 진행 중이며 실시간 판매량과 수입이 갱신됩니다.' : '현재 제출된 생산계획의 확정 고용·설비·비용과 전량 판매 가정 예상치를 비교합니다.'}</p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>기업</th>
                  <th>생산확정</th>
                  <th>시장</th>
                  <th>퀴즈</th>
                  <th>확정 고용</th>
                  <th>확정 기계</th>
                  <th>생산/판매희망</th>
                  <th>한계생산</th>
                  <th>평균비용</th>
                  <th>한계비용</th>
                  <th>{activeRoom.roundPhase === 'RESULT' ? '실제 판매' : activeRoom.roundPhase === 'SELLING' ? '실시간 판매' : '예상 판매'}</th>
                  <th><button type="button" onClick={() => setProfitVisibleKey(showProfits ? '' : profitKey)}>{showProfits ? '이윤 숨기기' : '이윤 보기'}</button>{activeRoom.roundPhase === 'RESULT' ? '실제 이윤' : activeRoom.roundPhase === 'SELLING' ? '실시간 수입' : '예상 이윤'}</th>
                  <th>현금</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const companyPlan = roundPlans.find((item) => item.companyId === company.id);
                  const averageCost = companyPlan ? Math.round((companyPlan.productionCost + (companyPlan.allocatedInvestmentCost || 0)) / Math.max(1, companyPlan.producedQuantity)) : null;
                  const expectedRevenue = companyPlan ? (companyPlan.offeredQuantity ?? companyPlan.producedQuantity) * (companyPlan.askingPrice || companyPlan.announcedPrice) : 0;
                  const expectedProfit = companyPlan ? expectedRevenue - companyPlan.productionCost - (companyPlan.allocatedInvestmentCost || 0) : 0;
                  const settled = companyPlan?.settlementStatus === 'SETTLED';
                  const isSubmitted = Boolean(companyPlan);
                  const liveSales = companyLiveSales.find((item) => item.company.id === company.id);
                  return (
                    <tr key={company.id}>
                      <td><strong>{company.name}</strong></td>
                      <td><span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, background: isSubmitted ? '#dcfce7' : '#fee2e2', color: isSubmitted ? '#166534' : '#991b1b' }}>{isSubmitted ? '확정' : '미확정'}</span></td>
                      <td>{companyPlan?.marketName || '-'}</td>
                      <td>{company.quizAttempts?.[String(activeRoom.currentRound)] ? company.quizAttempts[String(activeRoom.currentRound)].correct ? '정답' : '오답' : company.quizCompletedRounds?.includes(activeRoom.currentRound) ? '완료' : '미제출'}</td>
                      <td>{companyPlan ? `${companyPlan.workerCount}명` : '-'}</td>
                      <td>{companyPlan ? `${companyPlan.machineCountAfter}대` : '-'}</td>
                      <td>{companyPlan ? `${companyPlan.producedQuantity.toLocaleString()}/${(companyPlan.offeredQuantity ?? companyPlan.producedQuantity).toLocaleString()}` : '-'}</td>
                      <td>{companyPlan ? `${companyPlan.marginalProduct.toFixed(2)}` : '-'}</td>
                      <td>{averageCost === null ? '-' : `${averageCost.toLocaleString()}원`}</td>
                      <td>{companyPlan?.marginalCost == null ? '-' : `${companyPlan.marginalCost.toLocaleString()}원`}</td>
                      <td>{companyPlan ? settled ? `${(companyPlan.soldQuantity || 0).toLocaleString()}개` : activeRoom.roundPhase === 'SELLING' ? <b style={{ color: '#7c3aed' }}>{liveSales?.liveSoldQuantity.toLocaleString()}개</b> : `${(companyPlan.offeredQuantity ?? companyPlan.producedQuantity).toLocaleString()}개` : '-'}</td>
                      <td className={showProfits ? (settled ? (companyPlan?.economicProfit || 0) : expectedProfit) >= 0 ? 'positive' : 'negative' : ''}>
                        {!showProfits ? '비공개' : companyPlan ? settled ? `${(companyPlan.economicProfit || 0).toLocaleString()}원` : activeRoom.roundPhase === 'SELLING' ? <b style={{ color: '#16a34a' }}>{liveSales?.liveRevenue.toLocaleString()}원</b> : `${expectedProfit.toLocaleString()}원` : '-'}
                      </td>
                      <td>{company.cash.toLocaleString()}원<br /><small>빚 {(company.loanBalance || 0).toLocaleString()}원 · 차감 후 {(company.cash - (company.loanBalance || 0)).toLocaleString()}원</small></td>
                      <td style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => setSelectedCompanyId(company.id)}>상세</button>
                        <button disabled={companyActionId === company.id} onClick={() => handleRenameCompany(company)} title="팀명 수정">수정</button>
                        <button disabled={companyActionId === company.id} onClick={() => handleDeleteCompany(company)} style={{ color: '#dc2626' }} title="기업 삭제">삭제</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCompany && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="company-status-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCompanyId(null); }}><section className="teacher-company-status-modal" style={{ ...card, border: '2px solid #2563eb' }}><div className="teacher-modal-heading"><h3 id="company-status-title" style={{ margin: 0 }}>🔎 {selectedCompany.name} 전체 상황</h3><button type="button" onClick={() => setSelectedCompanyId(null)} aria-label="기업 상황 닫기">✕</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '9px' }}><span>업종 경험 <b style={{ float: 'right' }}>{selectedCompany.industryTraitIcon} {selectedCompany.industryTraitName || '선택 전'}</b></span><span>자본금 <b style={{ float: 'right' }}>{selectedCompany.cash.toLocaleString()}원</b></span><span>현금 − 대출잔액 <b style={{ float: 'right' }}>{(selectedCompany.cash - (selectedCompany.loanBalance || 0)).toLocaleString()}원</b></span><span>대출잔액 <b style={{ float: 'right' }}>{(selectedCompany.loanBalance || 0).toLocaleString()}원</b></span><span>현재 노동자 <b style={{ float: 'right' }}>{selectedCompany.employeeCount || 1}명</b></span><span>현재 보유 기계 <b style={{ float: 'right' }}>{selectedCompany.machineCount || 1}대</b></span><span>이번 라운드 퀴즈 <b style={{ float: 'right' }}>{selectedCompany.quizCompletedRounds?.includes(activeRoom.currentRound) ? '완료' : '미완료'}</b></span>{UPGRADE_OPTIONS.map((upgrade) => <span key={upgrade.id}>{upgrade.icon} {upgrade.name}<b style={{ float: 'right' }}>Lv.{selectedCompany.upgrades?.[upgrade.id] || 0}</b></span>)}</div>{selectedCompanyPlan ? <div style={{ marginTop: '12px', padding: '12px', background: '#eff6ff', borderRadius: '9px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '8px' }}><span>선택시장 <b style={{ float: 'right' }}>{selectedCompanyPlan.marketName}</b></span><span>확정 고용 <b style={{ float: 'right' }}>{selectedCompanyPlan.workerCount}명</b></span><span>확정 기계 <b style={{ float: 'right' }}>{selectedCompanyPlan.machineCountAfter}대</b></span><span>생산/판매희망 <b style={{ float: 'right' }}>{selectedCompanyPlan.producedQuantity}/{selectedCompanyPlan.offeredQuantity ?? selectedCompanyPlan.producedQuantity}</b></span><span>한계생산 <b style={{ float: 'right' }}>{selectedCompanyPlan.marginalProduct.toFixed(2)}</b></span><span>한계비용 <b style={{ float: 'right' }}>{selectedCompanyPlan.marginalCost?.toLocaleString() || '-'}원</b></span><span>생산비 <b style={{ float: 'right' }}>{selectedCompanyPlan.productionCost.toLocaleString()}원</b></span><span>매출 <b style={{ float: 'right' }}>{showProfits ? `${(selectedCompanyPlan.revenue || 0).toLocaleString()}원` : '비공개'}</b></span><span>이윤 <b style={{ float: 'right' }}>{showProfits ? `${(selectedCompanyPlan.economicProfit ?? selectedCompanyPlan.profit ?? 0).toLocaleString()}원` : '비공개'}</b></span></div> : <p style={{ color: '#64748b' }}>이번 라운드 생산계획을 아직 제출하지 않았습니다.</p>}<div className="teacher-student-roster"><h4>👥 학생 명단 추가·수정·삭제</h4><StudentRosterEditor key={`${selectedCompany.id}:${selectedCompany.studentMembers?.length || 0}`} initialMembers={selectedCompany.studentMembers || []} onSave={(members) => companyService.updateStudentMembers(selectedCompany.roomId, selectedCompany.id, members)} /><div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}><button onClick={() => window.open(`/student?roomId=${encodeURIComponent(selectedCompany.roomId)}&name=${encodeURIComponent(selectedCompany.name)}&teacher=1`, '_blank')}>학생 기업화면 열기·편집</button><button disabled={companyActionId === selectedCompany.id} onClick={() => handleRenameCompany(selectedCompany)}>팀명 수정</button><button disabled={companyActionId === selectedCompany.id} onClick={() => { handleDeleteCompany(selectedCompany); setSelectedCompanyId(null); }} style={{ color: '#dc2626' }}>기업 삭제</button></div></div></section></div>}

        <section style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa' }}><div className="reflection-status-heading"><h3 style={{ margin: 0 }}>📝 경제 활동지 제출 현황 ({reflections.length}/{companies.length})</h3><button type="button" className="reflection-settings-open" onClick={() => setShowReflectionSettings(true)}>⚙️ 활동지 설정</button></div>{activeRoom.currentRound % (activeRoom.reflectionInterval || 3) !== 0 ? <p style={{ color: '#64748b' }}>현재 라운드는 제출 차례가 아닙니다. 활동지는 {activeRoom.reflectionInterval || 3}라운드마다 열립니다.</p> : reflections.length === 0 ? <p style={{ color: '#64748b' }}>아직 제출된 활동지가 없습니다.</p> : <div style={{ display: 'grid', gap: '10px' }}>{reflections.map((reflection) => <details key={reflection.id} style={{ background: '#fff', padding: '12px', borderRadius: '9px' }}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>{reflection.companyName} · {reflection.sheetTitle || '경제 활동지'}</summary>{reflection.answers?.length ? reflection.answers.map((answer) => <p key={answer.questionId}><b>{answer.question}</b><br />{answer.answer}</p>) : <><p><b>한계생산물·한계비용:</b> {reflection.marginalProductObservation}</p><p><b>시장 변화:</b> {reflection.marketChangeObservation}</p><p><b>다음 전략:</b> {reflection.nextStrategy}</p></>}</details>)}</div>}</section>

        {showReflectionSettings && <div className="teacher-nested-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-settings-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowReflectionSettings(false); }}><section className="teacher-company-status-modal reflection-settings-modal" style={{ ...card, border: '2px solid #0f766e' }}><div className="teacher-modal-heading"><h3 id="reflection-settings-title" style={{ margin: 0 }}>📝 경제 활동지 설정</h3><button type="button" onClick={() => setShowReflectionSettings(false)} aria-label="활동지 설정 닫기">✕</button></div><ReflectionSettings key={`${activeRoom.id}:${activeRoom.reflectionInterval}:${JSON.stringify(activeRoom.reflectionSheets || [])}`} interval={activeRoom.reflectionInterval || 3} sheets={activeRoom.reflectionSheets?.length ? activeRoom.reflectionSheets : DEFAULT_REFLECTION_SHEETS} onSave={(interval, sheets) => roomService.updateReflectionSettings(activeRoom.id, interval, sheets)} /></section></div>}
      </div>}
    </main>
  </div>;
};
