import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [companyName, setCompanyName] = useState('');

  const handleJoinStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !companyName.trim()) return;
    navigate(`/student?roomId=${roomId}&name=${encodeURIComponent(companyName)}`);
  };

  return (
    <div style={{ maxWidth: '500px', margin: '60px auto', fontFamily: 'sans-serif', padding: '24px', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      <h1 style={{ textAlign: 'center', color: '#1e293b', marginBottom: '8px' }}>MarketLab</h1>
      <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>
        고등학교 경제 수업 실시간 시장 시뮬레이터
      </p>

      {/* 교사 모드 진입 */}
      <div style={{ marginBottom: '28px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#334155' }}>👨‍🏫 교사용 모드</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>새로운 수업 룸을 개설하고 시장 정책을 제어합니다.</p>
        <button
          onClick={() => navigate('/teacher')}
          style={{ width: '100%', padding: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          새 수업 개설하기
        </button>
      </div>

      {/* 학생 모드 진입 */}
      <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#334155' }}>🏢 학생(기업) 모드</h3>
        <form onSubmit={handleJoinStudent}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '4px' }}>룸 코드</label>
            <input
              type="text"
              placeholder="예: ROOM101"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '4px' }}>기업명 (팀 이름/학생 이름)</label>
            <input
              type="text"
              placeholder="예: 알파테크"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <button
            type="submit"
            style={{ width: '100%', padding: '10px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            시장 참여하기
          </button>
        </form>
      </div>
    </div>
  );
};
