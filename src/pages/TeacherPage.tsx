import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { companyService, newsService, productionService, reflectionService, roomService } from '../services';
import type { Company, DemandEvent, LearningReflection, MarketRoundResult, ProductionPlan, Room } from '../types/domain';
import { DEMAND_EVENT_OPTIONS, MARKETS, TECHNOLOGIES } from '../types/domain';
import { MarketCurveChart } from '../components/MarketCurveChart';

const statusLabel = { WAITING: '시작 전', RUNNING: '진행 중', FINISHED: '종료' } as const;

export const TeacherPage: React.FC = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roundPlans, setRoundPlans] = useState<ProductionPlan[]>([]);
  const [roundResults, setRoundResults] = useState<MarketRoundResult[]>([]);
  const [allResults, setAllResults] = useState<MarketRoundResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomAction, setRoomAction] = useState(false);
  const [companyActionId, setCompanyActionId] = useState<string | null>(null);
  const [demandSelections, setDemandSelections] = useState<Record<string, string>>({});
  const [newsGenerating, setNewsGenerating] = useState(false);
  const [clock, setClock] = useState(0);
  const [reflections, setReflections] = useState<LearningReflection[]>([]);
  const activeRoomId = activeRoom?.id;
  const activeRound = activeRoom?.currentRound;

  useEffect(() => roomService.subscribeRooms(setRooms), []);
  useEffect(() => { if (activeRoom?.roundPhase !== 'SELLING') return; const timer = window.setInterval(() => setClock(Date.now()), 500); return () => window.clearInterval(timer); }, [activeRoom?.roundPhase]);
  useEffect(() => {
    if (!activeRoomId) return;
    const unsubscribeRoom = roomService.subscribeRoom(activeRoomId, (value) => value && setActiveRoom(value));
    const unsubscribeCompanies = companyService.subscribeCompanies(activeRoomId, setCompanies);
    return () => { unsubscribeRoom(); unsubscribeCompanies(); };
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) return;
    return productionService.subscribeAllResults(activeRoomId, setAllResults);
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
      setActiveRoom({ id: roomId.trim(), title: title.trim(), markets: MARKETS, currentRound: 1, status: 'WAITING', roundPhase: 'DECISION', demandEvents, pendingDemandEvents: [], createdAt: Date.now() });
      setDemandSelections(Object.fromEntries(MARKETS.map((market) => [market.id, 'baseline'])));
    } catch (error) {
      alert(error instanceof Error && error.message === 'ROOM_ALREADY_EXISTS' ? '이미 사용 중인 룸 코드입니다.' : '룸 생성 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  const runRoomAction = async (action: 'start' | 'sell' | 'settle' | 'next' | 'finish') => {
    if (!activeRoom) return;
    const prompt = action === 'start'
      ? '1라운드를 시작할까요?'
      : action === 'sell'
        ? '기업 선택을 마감하고 30초(4개월) 판매를 시작할까요? 판매 중에는 희망가격 인하만 가능합니다.'
        : action === 'settle'
          ? '4개월 판매 결과를 확정할까요?'
        : action === 'next'
          ? `Round ${activeRoom.currentRound + 1}로 넘어갈까요? 학생들은 새 생산·판매 결정을 할 수 있습니다.`
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

  const handleDeleteRoom = async () => {
    if (!activeRoom || activeRoom.status !== 'FINISHED') return;
    if (!window.confirm(`${activeRoom.title} (${activeRoom.id}) 룸을 삭제할까요? 모든 기업·재고·생산·거래 기록이 삭제되며 복구할 수 없습니다.`)) return;
    try {
      setRoomAction(true);
      await roomService.deleteRoom(activeRoom.id);
      setActiveRoom(null);
    } catch { alert('룸 삭제 중 오류가 발생했습니다.'); }
    finally { setRoomAction(false); }
  };

  const openRoom = (room: Room) => {
    setActiveRoom(room);
    setDemandSelections(Object.fromEntries(room.markets.map((market) => [
      market.id,
      room.pendingDemandEvents.find((event) => event.marketId === market.id)?.optionId || 'baseline',
    ])));
  };

  const canPrepareDemandEvents = activeRoom?.status === 'WAITING'
    || (activeRoom?.status === 'RUNNING' && activeRoom.roundPhase === 'RESULT');

  const handleRandomDemandEvents = () => {
    if (!activeRoom || !canPrepareDemandEvents) return;
    const choices = DEMAND_EVENT_OPTIONS.filter((option) => option.id !== 'baseline');
    setDemandSelections(Object.fromEntries(activeRoom.markets.map((market) => [
      market.id,
      choices[Math.floor(Math.random() * choices.length)].id,
    ])));
  };

  const handleConfirmDemandEvents = async () => {
    if (!activeRoom || !canPrepareDemandEvents) return;
    try {
      setNewsGenerating(true);
      const events = await Promise.all(activeRoom.markets.map(async (market): Promise<DemandEvent> => {
        const option = DEMAND_EVENT_OPTIONS.find((item) => item.id === demandSelections[market.id]) || DEMAND_EVENT_OPTIONS[DEMAND_EVENT_OPTIONS.length - 1];
        const article = await newsService.generateDemandArticle(market, option);
        return { marketId: market.id, optionId: option.id, factor: option.factor, effectType: option.effectType || 'DEMAND', title: option.title, description: option.description, multiplier: option.multiplier, materialMultiplier: option.materialMultiplier, wageMultiplier: option.wageMultiplier, productivityMultiplier: option.productivityMultiplier, supplyMultiplier: option.supplyMultiplier, articleHeadline: article.headline, articleBody: article.body, generatedBy: article.generatedBy };
      }));
      await roomService.confirmDemandEvents(activeRoom.id, events);
      alert(`Round ${activeRoom.status === 'WAITING' ? activeRoom.currentRound : activeRoom.currentRound + 1} 시장 신문이 발행되었습니다.`);
    } catch {
      alert('시장 사건 확정 중 오류가 발생했습니다.');
    } finally { setNewsGenerating(false); }
  };

  const techCounts = TECHNOLOGIES.map((technology) => ({ ...technology, count: companies.filter((company) => company.technologyId === technology.id).length }));
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

  return <div style={{ minHeight: '100vh', padding: '32px 20px', background: '#f8fafc' }}>
    <main className="teacher-shell">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div><span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb' }}>MARKETLAB TEACHER</span><h1 style={{ margin: '3px 0', fontSize: '24px' }}>👨‍🏫 교사용 대시보드</h1></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {activeRoom && <button onClick={() => setActiveRoom(null)} style={{ padding: '8px 11px' }}>다른 룸</button>}
          <button onClick={() => navigate('/', { replace: true })} style={{ padding: '8px 11px' }}>로그아웃</button>
        </div>
      </header>

      {!activeRoom ? <div style={{ display: 'grid', gap: '20px' }}>
        <section style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>기존 수업 룸</h2>
          {rooms.length === 0 ? <p style={{ color: '#64748b' }}>아직 개설된 룸이 없습니다.</p> : <div style={{ display: 'grid', gap: '10px' }}>{rooms.map((room) =>
            <div key={room.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '10px', background: '#f8fafc' }}>
              <div><strong>{room.title}</strong><span style={{ display: 'block', color: '#2563eb', fontSize: '13px' }}>룸 코드: {room.id}</span><small style={{ color: '#64748b' }}>3개 시장 · Round {room.currentRound} · {statusLabel[room.status]}</small></div>
              <button onClick={() => openRoom(room)} style={{ padding: '9px 13px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px' }}>열기</button>
            </div>)}</div>}
        </section>
        <section style={card}><h2 style={{ marginTop: 0, fontSize: '18px' }}>새 수업 룸 만들기</h2>
          <p style={{ color: '#64748b', fontSize: '13px' }}>룸을 만들면 카페 음료·쌀(20kg)·스마트폰 시장이 모두 열립니다.</p>
          <form onSubmit={handleCreateRoom} style={{ display: 'grid', gap: '12px' }}>
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="룸 코드 (예: 경제-3반)" style={{ padding: '12px' }} />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="수업 제목" style={{ padding: '12px' }} />
            <button disabled={loading} style={{ padding: '13px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>{loading ? '생성 중...' : '3개 시장이 있는 수업 개설하기'}</button>
          </form>
        </section>
      </div> : <div className="teacher-dashboard">
        <section className="teacher-room-summary" style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div><h2 style={{ margin: 0 }}>{activeRoom.title}</h2><p style={{ margin: '5px 0', color: '#2563eb', fontWeight: 800 }}>룸 코드 {activeRoom.id}</p><span style={{ color: '#64748b' }}>Round {activeRoom.currentRound} ({(activeRoom.currentRound - 1) * 4 + 1}~{activeRoom.currentRound * 4}개월) · {statusLabel[activeRoom.status]} · {companies.length}개사</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button disabled={roomAction} onClick={handleEditRoom} style={{ padding: '11px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#334155', fontWeight: 700 }}>룸 정보 수정</button>
              {activeRoom.status === 'WAITING' && <button disabled={roomAction} onClick={() => runRoomAction('start')} style={{ padding: '11px 16px', background: '#16a34a', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>1라운드 시작</button>}
              {activeRoom.status === 'RUNNING' && <>{activeRoom.roundPhase === 'DECISION' ? <button disabled={roomAction} onClick={() => runRoomAction('sell')} style={{ padding: '11px 16px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>30초 판매 시작</button> : activeRoom.roundPhase === 'SELLING' ? <button disabled={roomAction || sellingSecondsLeft > 0} onClick={() => runRoomAction('settle')} style={{ padding: '11px 16px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>{sellingSecondsLeft > 0 ? `판매 중 ${sellingSecondsLeft}초` : '판매 결과 확정'}</button> : activeRoom.roundPhase === 'SETTLING' ? <button disabled style={{ padding: '11px 16px' }}>거래 계산 중...</button> : <button disabled={roomAction} onClick={() => runRoomAction('next')} style={{ padding: '11px 16px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>다음 라운드</button>}<button disabled={roomAction || activeRoom.roundPhase === 'SETTLING'} onClick={() => runRoomAction('finish')} style={{ padding: '11px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px' }}>수업 종료</button></>}
              {activeRoom.status === 'FINISHED' && <button disabled={roomAction} onClick={handleDeleteRoom} style={{ padding: '11px 14px', background: '#dc2626', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800 }}>룸 삭제</button>}
            </div>
          </div>
        </section>

        {canPrepareDemandEvents && <section className="teacher-demand-events" style={{ ...card, border: '2px solid #d97706', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
            <div><h3 style={{ margin: 0 }}>📰 다음 시장 신문 준비(선택)</h3><p style={{ margin: '6px 0', color: '#92400e', fontSize: '13px' }}>몇 라운드마다 충격을 주고 싶을 때만 발행하세요. 발행하지 않으면 다음 라운드는 자동으로 ‘변화 없음’이 적용됩니다.</p></div>
            <div style={{ display: 'flex', gap: '8px' }}><button disabled={newsGenerating} onClick={handleRandomDemandEvents}>🎲 수요·공급 사건 무작위 선택</button><button disabled={newsGenerating} onClick={handleConfirmDemandEvents} style={{ background: '#d97706', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 14px', fontWeight: 800 }}>{newsGenerating ? '기사 작성 중...' : '선택 확정·신문 발행'}</button></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px', marginTop: '14px' }}>{activeRoom.markets.map((market) => <label key={market.id} style={{ background: '#fff', padding: '13px', borderRadius: '10px', border: '1px solid #fcd34d' }}><strong>{market.icon} {market.name}</strong><select value={demandSelections[market.id] || 'baseline'} onChange={(event) => setDemandSelections((current) => ({ ...current, [market.id]: event.target.value }))} style={{ width: '100%', marginTop: '8px', padding: '9px' }}>{DEMAND_EVENT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>)}</div>
          {activeRoom.pendingDemandEvents.length > 0 && <div style={{ marginTop: '16px' }}><strong>발행된 신문 미리보기</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '10px', marginTop: '9px' }}>{activeRoom.pendingDemandEvents.map((event) => { const market = activeRoom.markets.find((item) => item.id === event.marketId); return <article key={event.marketId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px' }}><small style={{ color: '#92400e', fontWeight: 800 }}>{market?.icon} {market?.name} · 교사용 정답: {event.title}</small><h4 style={{ margin: '7px 0' }}>{event.articleHeadline}</h4><p style={{ margin: 0, color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>{event.articleBody}</p><small style={{ display: 'block', marginTop: '8px', color: '#94a3b8' }}>{event.generatedBy === 'AI' ? 'AI 작성' : '자동 템플릿 작성'}</small></article>; })}</div></div>}
        </section>}

        <section className="teacher-markets" style={card}><h3 style={{ marginTop: 0 }}>📊 동시에 개설된 시장과 공개가격</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>{marketStats.map((market) =>
            <div key={market.id} style={{ padding: '16px', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '12px' }}>
              <span style={{ fontSize: '28px' }}>{market.icon}</span><strong style={{ display: 'block' }}>{market.name}</strong><b style={{ color: '#dc2626', fontSize: '19px' }}>{market.priceControl === 'FIRM_PRICE' ? '시장 기준가격' : '시장가격'} {market.announcedPrice.toLocaleString()}원</b><div style={{ marginTop: '6px', color: '#7c3aed', fontSize: '12px', fontWeight: 700 }}>수요 변화: {market.demandEvent?.title || '기준 수요'}</div>
              <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid #bfdbfe', display: 'grid', gap: '4px', fontSize: '13px' }}><span>진입 기업 <b style={{ float: 'right' }}>{market.companyCount}개사</b></span><span>Round {activeRoom.currentRound} 총생산 <b style={{ float: 'right' }}>{market.totalSupply.toLocaleString()}개</b></span>{market.result ? <><span>실제 시장가격 <b style={{ float: 'right', color: '#dc2626' }}>{market.result.marketPrice === null ? '거래 없음' : `${market.result.marketPrice.toLocaleString()}원`}</b></span><span>실제 거래량 <b style={{ float: 'right', color: '#2563eb' }}>{market.result.tradedQuantity.toLocaleString()}개</b></span></> : <span>예상 시장매출 <b style={{ float: 'right' }}>{market.expectedMarketSales.toLocaleString()}원</b></span>}</div>
              <small style={{ display: 'block', color: '#64748b', marginTop: '7px' }}>{market.description}</small>
            </div>)}</div>
        </section>

        <section className="teacher-curves" style={card}><h3 style={{ marginTop: 0 }}>📉 가격수용 시장 수요·공급곡선</h3><p style={{ color: '#64748b', fontSize: '13px' }}>스마트폰 과점시장에는 하나의 공급곡선을 적용하지 않습니다.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '18px' }}>{activeRoom.markets.filter((market) => market.marketType === 'PERFECT_COMPETITION').map((market) => <MarketCurveChart key={market.id} market={market} plans={roundPlans.filter((plan) => plan.productId === market.id)} demandMultiplier={activeRoom.demandEvents.find((event) => event.marketId === market.id)?.multiplier || 1} />)}</div></section>

        <section className="teacher-tech" style={card}><h3 style={{ marginTop: 0 }}>⚙️ 기업 특성 분포</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{techCounts.map((item) => <span key={item.id} style={{ background: '#f1f5f9', padding: '8px 11px', borderRadius: '8px' }}>{item.icon} {item.name} <b>{item.count}</b></span>)}</div></section>

        {allResults.length > 0 && <section className="teacher-history" style={card}><h3 style={{ marginTop: 0 }}>📈 라운드별 시장가격과 거래량</h3><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}><thead><tr><th>라운드</th><th>시장</th><th>수요 변화</th><th>시장가격</th><th>총생산</th><th>거래량</th></tr></thead><tbody>{allResults.map((result) => <tr key={result.id} style={{ borderTop: '1px solid #e2e8f0' }}><td style={{ padding: '9px' }}>R{result.roundNumber}</td><td>{result.marketName}</td><td>{result.demandEventTitle || '-'}</td><td>{result.marketPrice?.toLocaleString()}원</td><td>{result.totalSupply.toLocaleString()}개</td><td style={{ color: '#2563eb', fontWeight: 800 }}>{result.tradedQuantity.toLocaleString()}개</td></tr>)}</tbody></table></div></section>}

        {activeRoom.currentRound % 3 === 0 && <section style={{ ...card, border: '2px solid #0f766e', background: '#f0fdfa' }}><h3 style={{ marginTop: 0 }}>📝 1년 경제 활동지 ({reflections.length}/{companies.length})</h3>{reflections.length === 0 ? <p style={{ color: '#64748b' }}>아직 제출된 활동지가 없습니다.</p> : <div style={{ display: 'grid', gap: '10px' }}>{reflections.map((reflection) => <details key={reflection.id} style={{ background: '#fff', padding: '12px', borderRadius: '9px' }}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>{reflection.companyName}</summary><p><b>한계생산물·한계비용:</b> {reflection.marginalProductObservation}</p><p><b>시장 변화:</b> {reflection.marketChangeObservation}</p><p><b>다음 전략:</b> {reflection.nextStrategy}</p></details>)}</div>}</section>}

        <section className="teacher-companies" style={card}><h3 style={{ marginTop: 0 }}>🏢 접속 기업 ({companies.length}개사)</h3>
          {companies.length === 0 ? <p style={{ color: '#64748b' }}>학생들에게 룸 코드 {activeRoom.id}를 안내해주세요.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>회사</th><th>자본금</th><th>노동자</th><th>기계</th><th>기술</th><th>관리</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} style={{ borderTop: '1px solid #e2e8f0', textAlign: 'center' }}><td style={{ padding: '12px' }}>{company.name}</td><td>{company.cash.toLocaleString()}원</td><td>{company.employeeCount || 1}명</td><td>{company.machineCount || 1}대</td><td>Lv.{company.technologyLevel || 0}</td><td><button disabled={companyActionId === company.id} onClick={() => handleRenameCompany(company)}>팀명 수정</button> <button disabled={companyActionId === company.id} onClick={() => handleDeleteCompany(company)} style={{ color: '#dc2626' }}>삭제</button></td></tr>)}</tbody></table></div>}
        </section>
      </div>}
    </main>
  </div>;
};
