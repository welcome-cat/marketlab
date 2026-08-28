import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [companyName, setCompanyName] = useState('');

  const handleJoinStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !companyName.trim()) {
      alert('룸 코드와 회사 이름을 모두 입력해주세요.');
      return;
    }
    navigate(`/student?roomId=${encodeURIComponent(roomId.trim())}&name=${encodeURIComponent(companyName.trim())}`);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)', padding: '32px' }}>
        
        {/* 헤더 로고 & 타이틀 */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '54px', height: '54px', borderRadius: '14px', background: '#eff6ff', color: '#2563eb', fontSize: '26px', marginBottom: '12px' }}>
            📊
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>MarketLab</h1>
          <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            고등학교 경제 수업 실시간 시장 시뮬레이터
          </p>
        </div>

        {/* 학생 입장 폼 */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏢</span> 학생(회사) 입장하기
          </h2>

          <form onSubmit={handleJoinStudent}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                룸 코드
              </label>
              <input
                type="text"
                placeholder="선생님이 안내한 코드 (예: ROOM101)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                회사 이름
              </label>
              <input
                type="text"
                placeholder="팀 또는 회사 이름 (예: 한빛전자)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                fontWeight: 700,
                color: '#ffffff',
                background: '#2563eb',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              }}
            >
              회사 설립 및 시장 입장
            </button>
          </form>
        </div>

        {/* 교사 모드 진입 링크 */}
        <div style={{ textAlign: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '13px', color: '#64748b', marginRight: '8px' }}>선생님이신가요?</span>
          <button
            onClick={() => navigate('/teacher')}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#2563eb',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            👨‍🏫 교사용 대시보드 개설
          </button>
        </div>
      </div>
    </div>
  );
};
