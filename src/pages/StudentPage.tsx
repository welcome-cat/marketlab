import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { decisionService } from '../services';

export const StudentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId') || 'DEMO-ROOM';
  const companyName = searchParams.get('name') || '내 기업';
  const companyId = `comp_${companyName.replace(/\s+/g, '_')}`;

  // 학생 의사결정 상태 (오직 생산량, 판매가격만 결정)
  const [quantity, setQuantity] = useState<number>(10);
  const [price, setPrice] = useState<number>(50);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmitDecision = async () => {
    try {
      setSubmitting(true);
      await decisionService.submitDecision(roomId, 1, {
        companyId,
        quantity,
        price,
        submittedAt: Date.now(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Decision submission failed:', err);
      alert('의사결정 제출 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', fontFamily: 'sans-serif', padding: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>🏢 {companyName}</h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>룸: {roomId}</span>
        </div>
        <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: '16px', fontSize: '13px', fontWeight: 600 }}>
          라운드 1 의사결정
        </div>
      </header>

      {/* 의사결정 패널 */}
      <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#334155' }}>🎯 의사결정 입력</h3>

        {/* 1. 생산량 슬라이더 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>1. 생산량</label>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#2563eb' }}>{quantity} 개</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={quantity}
            disabled={submitted}
            onChange={(e) => setQuantity(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* 2. 판매가격 슬라이더 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>2. 판매 희망가격</label>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#059669' }}>{price} 원</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={price}
            disabled={submitted}
            onChange={(e) => setPrice(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* 제출 버튼 */}
      <button
        onClick={handleSubmitDecision}
        disabled={submitted || submitting}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: submitted ? '#94a3b8' : '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 700,
          cursor: submitted ? 'not-allowed' : 'pointer',
        }}
      >
        {submitted ? '✅ 의사결정 제출 완료' : submitting ? '제출 중...' : '의사결정 최종 제출하기'}
      </button>
    </div>
  );
};
