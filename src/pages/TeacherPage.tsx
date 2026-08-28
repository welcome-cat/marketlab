import React, { useState } from 'react';
import { roomService } from '../services';
import type { RoomData } from '../services';

export const TeacherPage: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [activeRoom, setActiveRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !title.trim()) return;

    try {
      setLoading(true);
      await roomService.createRoom(roomId, title);
      roomService.subscribeRoom(roomId, (room) => {
        setActiveRoom(room);
      });
    } catch (err) {
      console.error('Room creation failed:', err);
      alert('룸 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '24px' }}>
      <header style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#1e293b' }}>👨‍🏫 교사용 대시보드 (MarketLab)</h2>
      </header>

      {!activeRoom ? (
        <form onSubmit={handleCreateRoom} style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ marginTop: 0, color: '#334155' }}>새 수업 룸 만들기</h3>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>룸 코드 (식별자)</label>
            <input
              type="text"
              placeholder="예: 3반-경제-01"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>수업 제목</label>
            <input
              type="text"
              placeholder="예: 3단원 시장 가격의 결정과 변동"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            {loading ? '생성 중...' : '수업 개설하기'}
          </button>
        </form>
      ) : (
        <div style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>{activeRoom.title} (코드: {activeRoom.id})</h3>
            <span style={{ padding: '4px 12px', background: '#e0f2fe', color: '#0284c7', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
              상태: {activeRoom.status}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            현재 라운드: <strong>{activeRoom.currentRound}</strong>
          </p>
          <div style={{ marginTop: '20px', padding: '16px', background: '#f1f5f9', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
              💡 학생들에게 룸 코드 <strong>{activeRoom.id}</strong>로 접속하도록 안내하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
