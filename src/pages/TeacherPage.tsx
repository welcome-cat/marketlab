import React, { useState, useEffect } from 'react';
import { roomService, companyService } from '../services';
import type { Room, Company } from '../types/domain';
import { MARKETS, TECHNOLOGIES } from '../types/domain';

export const TeacherPage: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState('market_tumbler');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeRoom) return;

    // 1. 룸 상태 구독
    const unsubscribeRoom = roomService.subscribeRoom(activeRoom.id, (roomData) => {
      if (roomData) setActiveRoom(roomData);
    });

    // 2. 접속한 회사 목록 실시간 구독
    const unsubscribeCompanies = companyService.subscribeCompanies(activeRoom.id, (list) => {
      setCompanies(list);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeCompanies();
    };
  }, [activeRoom?.id]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomId.trim() || !title.trim()) {
      alert('룸 코드와 수업 제목을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      await roomService.createRoom(roomId.trim(), title.trim(), selectedMarketId);
      const chosenMarket = MARKETS.find((m) => m.id === selectedMarketId) || MARKETS[0];
      setActiveRoom({
        id: roomId.trim(),
        title: title.trim(),
        marketId: chosenMarket.id,
        marketName: chosenMarket.name,
        marketDescription: chosenMarket.description,
        marketIcon: chosenMarket.icon,
        currentRound: 1,
        status: 'WAITING',
        createdAt: Date.now(),
      });
    } catch (err) {
  console.error('Room creation failed:', err);
  alert('룸 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 기술별 분포 집계
  const techCounts = TECHNOLOGIES.map((t) => ({
    ...t,
    count: companies.filter((c) => c.technologyId === t.id).length,
  }));

  return (
    <div style={{ minHeight: '100vh', padding: '32px 20px', background: '#f8fafc' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        
        {/* 상단 네비게이션 헤더 */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', letterSpacing: '0.5px' }}>MARKETLAB TEACHER</span>
            <h1 style={{ margin: '2px 0 0 0', color: '#0f172a', fontSize: '24px', fontWeight: 800 }}>👨‍🏫 교사용 대시보드</h1>
          </div>
          {activeRoom && (
            <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>
              Round {activeRoom.currentRound} 진행 중
            </span>
          )}
        </header>

        {!activeRoom ? (
          /* 룸 개설 폼 */
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '28px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              새 수업 룸 만들기
            </h2>

            <form onSubmit={handleCreateRoom}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  룸 코드 (학생 접속용)
                </label>
                <input
                  type="text"
                  placeholder="예: 3반-경제-01"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  수업 제목
                </label>
                <input
                  type="text"
                  placeholder="예: 3단원 시장 가격의 결정과 기업의 생산비"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                  진행할 시장 선택 (모든 학생 공통 적용)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {MARKETS.map((m) => {
                    const isSelected = selectedMarketId === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMarketId(m.id)}
                        style={{
                          padding: '14px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '24px' }}>{m.icon}</span>
                        <strong style={{ display: 'block', fontSize: '15px', color: isSelected ? '#1e40af' : '#1e293b', marginTop: '4px' }}>
                          {m.name}
                        </strong>
                        <span style={{ fontSize: '12px', color: isSelected ? '#3b82f6' : '#64748b', lineHeight: '1.4', display: 'block', marginTop: '2px' }}>
                          {m.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '15px',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                }}
              >
                {loading ? '생성 중...' : '수업 개설하기'}
              </button>
            </form>
          </div>
        ) : (
          /* 룸 개설 후 실시간 모니터링 뷰 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 1. 룸 및 시장 정보 카드 */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 800 }}>
                  {activeRoom.title}
                </h2>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  현재 참여 기업: <strong style={{ color: '#2563eb' }}>{companies.length}</strong>개사
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '14px', color: '#475569', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>학생 접속 룸 코드</span>
                  <strong style={{ color: '#2563eb', fontSize: '18px', letterSpacing: '0.5px' }}>{activeRoom.id}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>진행 시장</span>
                  <strong style={{ color: '#0f172a', fontSize: '16px' }}>{activeRoom.marketIcon} {activeRoom.marketName}</strong>
                </div>
              </div>
            </div>

            {/* 2. 기업 특성 분포 요약 */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                ⚙️ 기업 특성(Technology) 분포 요약
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {techCounts.map((t) => (
                  <div key={t.id} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px' }}>{t.icon}</div>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#334155', marginTop: '2px' }}>{t.name}</strong>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      {t.count} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>개사</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. 참여 기업 상세 목록 */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                  🏢 접속 기업 목록 ({companies.length}개사)
                </h3>
                <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>● 실시간 동기화 중</span>
              </div>

              {companies.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                    아직 입장한 회사가 없습니다. 학생들에게 룸 코드(<strong>{activeRoom.id}</strong>)를 안내해주세요.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>#</th>
                        <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>회사 이름</th>
                        <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>보유 핵심 기술</th>
                        <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>보유 자본금</th>
                        <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((company, index) => (
                        <tr key={company.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{index + 1}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>{company.name}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                              {company.technologyIcon} {company.technologyName}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#059669', fontWeight: 700 }}>
                            {company.cash?.toLocaleString()} 원
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 700 }}>{company.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
