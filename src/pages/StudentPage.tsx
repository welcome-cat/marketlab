import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { companyService, roomService } from '../services';
import type { Company, Room } from '../types/domain';

export const StudentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomId = searchParams.get('roomId') || '';
  const companyName = searchParams.get('name') || '';

  const [company, setCompany] = useState<Company | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 생산량 결정 상태 (0 ~ 100개, 기본 25개)
  const [productionQty, setProductionQty] = useState<number>(25);

  // 단위당 생산비 (노동 150원 + 원자재 150원 = 개당 300원)
  const UNIT_COST = 300;
  const estimatedCost = productionQty * UNIT_COST;

  useEffect(() => {
    if (!roomId || !companyName) {
      setError('룸 코드 또는 회사 이름이 누락되었습니다.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. 회사 생성 및 초기화
    companyService
      .registerCompany(roomId, companyName)
      .then((createdCompany) => {
        if (isMounted) {
          setCompany(createdCompany);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Company registration error:', err);
        if (isMounted) {
          setError('회사 등록 중 오류가 발생했습니다.');
          setLoading(false);
        }
      });

    // 2. 룸 상태 실시간 구독
    const unsubscribeRoom = roomService.subscribeRoom(roomId, (roomData) => {
      if (isMounted) {
        setRoom(roomData);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeRoom();
    };
  }, [roomId, companyName]);

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', padding: '32px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
          <p style={{ margin: 0, color: '#334155', fontWeight: 600, fontSize: '16px' }}>회사를 설립하고 시장에 입장 중입니다...</p>
          <span style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px', display: 'block' }}>잠시만 기다려주세요</span>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '28px', background: '#ffffff', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 12px rgba(220,38,38,0.08)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ color: '#dc2626', margin: '0 0 8px 0', fontSize: '18px' }}>입장 오류</h3>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>{error}</p>
          <button
            onClick={() => navigate('/')}
            style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 16px', background: '#f8fafc' }}>
      <main style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* 1. 회사 기본 정보 카드 */}
        <section style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                룸: {company.roomId} {room ? `· ${room.title}` : ''}
              </span>
              <h1 style={{ margin: '2px 0 0 0', color: '#0f172a', fontSize: '22px', fontWeight: 800 }}>
                🏢 {company.name}
              </h1>
            </div>
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
              {company.status}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '14px' }}>
            <span style={{ color: '#64748b' }}>보유 자본금</span>
            <strong style={{ color: '#059669', fontSize: '16px', fontWeight: 700 }}>
              {company.cash.toLocaleString()} 원
            </strong>
          </div>
        </section>

        {/* 2. 회사 특성 (Technology) 카드 */}
        <section style={{ background: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe', padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '24px' }}>{company.technologyIcon}</span>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e40af' }}>
              우리 회사의 핵심 기술: {company.technologyName}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
            {company.technologyDescription}
          </p>
        </section>

        {/* 3. 현재 참여 시장 카드 (읽기 전용) */}
        <section style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '18px 22px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              현재 참여 시장
            </span>
            <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              공통 시장
            </span>
          </div>

          {room ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '30px' }}>{room.marketIcon}</span>
              <div>
                <strong style={{ fontSize: '15px', color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                  {room.marketName}
                </strong>
                <span style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
                  {room.marketDescription}
                </span>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>시장 정보를 불러오는 중...</p>
          )}
        </section>

        {/* 4. 오늘의 생산 계획 및 생산비 강조 카드 */}
        <section style={{ background: '#ffffff', borderRadius: '16px', border: '2px solid #2563eb', padding: '24px', boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
              📦 오늘의 생산 계획
            </h2>
            <span style={{ fontSize: '12px', color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
              Round {room ? room.currentRound : 1}
            </span>
          </div>

          {/* 생산량 조절 슬라이더 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>
                목표 생산량
              </label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: '#2563eb', transition: 'all 0.1s ease' }}>
                  {productionQty}
                </span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#64748b' }}>개</span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={productionQty}
              onChange={(e) => setProductionQty(Number(e.target.value))}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              <span>0개 (생산 안 함)</span>
              <span>50개</span>
              <span>100개 (최대)</span>
            </div>
          </div>

          {/* 예상 생산비 카드 (크게 강조) */}
          <div style={{ padding: '18px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>예상 생산비</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#dc2626', letterSpacing: '-0.5px' }}>
                {estimatedCost.toLocaleString()}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748b' }}>원</span>
            </div>
          </div>
        </section>

        {/* 5. 생각해보기 (교육용 힌트 카드) */}
        <section style={{ padding: '16px 20px', background: '#fefce8', borderRadius: '12px', border: '1px solid #fef08a' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '18px', marginTop: '1px' }}>💡</span>
            <div>
              <strong style={{ fontSize: '13px', color: '#854d0e', display: 'block', marginBottom: '2px' }}>
                생각해보기
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#a16207', lineHeight: '1.5' }}>
                생산량이 많아질수록 더 많은 <strong>노동</strong>과 <strong>원자재</strong>가 투입되어 비용이 함께 증가합니다.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};
