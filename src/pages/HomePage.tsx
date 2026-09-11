import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { companyService } from '../services';
import type { Company } from '../types/domain';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [studentMembers, setStudentMembers] = useState([{ studentNumber: '', name: '' }]);
  const [teacherLoginOpen, setTeacherLoginOpen] = useState(false);
  const [teacherPassword, setTeacherPassword] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [companyCheck, setCompanyCheck] = useState<{ kind: 'new' } | { kind: 'existing'; company: Company } | null>(null);
  const [checkingCompany, setCheckingCompany] = useState(false);
  const [companyCheckMessage, setCompanyCheckMessage] = useState('');
  const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() || window.location.origin;

  const resetCompanyCheck = () => { setCompanyCheck(null); setCompanyCheckMessage(''); };
  const handleCheckCompany = async () => {
    if (!roomId.trim() || !companyName.trim()) return setCompanyCheckMessage('룸 코드와 회사 이름을 먼저 입력해주세요.');
    try {
      setCheckingCompany(true);
      setCompanyCheckMessage('');
      const existing = await companyService.findCompanyByName(roomId.trim(), companyName.trim());
      setCompanyCheck(existing ? { kind: 'existing', company: existing } : { kind: 'new' });
      setCompanyCheckMessage(existing ? '운영되고 있는 기업입니다.' : '아직 없는 기업입니다. 참여 학생 명단을 입력해 새 회사를 창립하세요.');
    } catch (error) {
      setCompanyCheck(null);
      setCompanyCheckMessage(error instanceof Error && error.message === 'ROOM_NOT_FOUND' ? '존재하지 않는 룸 코드입니다.' : '기업을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally { setCheckingCompany(false); }
  };
  const validNewMembers = studentMembers.length > 0 && studentMembers.every((member) => member.studentNumber.trim() && member.name.trim());
  const handleJoinStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyCheck) return setCompanyCheckMessage('회사 이름 옆의 확인 버튼을 먼저 눌러주세요.');
    if (companyCheck.kind === 'new' && !validNewMembers) return setCompanyCheckMessage('새 회사를 창립하려면 모든 학생의 학번과 이름을 입력해주세요.');
    const members = companyCheck.kind === 'new' ? studentMembers.map((member) => ({ studentNumber: member.studentNumber.trim(), name: member.name.trim() })) : [];
    navigate(`/student?roomId=${encodeURIComponent(roomId.trim())}&name=${encodeURIComponent(companyName.trim())}&members=${encodeURIComponent(JSON.stringify(members))}`);
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
                onChange={(e) => { setRoomId(e.target.value); resetCompanyCheck(); }}
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

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                회사 이름
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '7px' }}><input
                  type="text"
                  placeholder="팀 또는 회사 이름 (예: 한빛전자)"
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); resetCompanyCheck(); }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    // 확인이 끝난 뒤에는 기본 폼 제출을 허용해 접속·창립으로 진행한다.
                    if (companyCheck) return;
                    event.preventDefault();
                    if (!checkingCompany && roomId.trim() && companyName.trim()) void handleCheckCompany();
                  }}
                  style={{ width: '100%', minWidth: 0, padding: '11px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', outline: 'none' }}
                /><button type="button" disabled={checkingCompany || !roomId.trim() || !companyName.trim()} onClick={() => void handleCheckCompany()} style={{ padding: '0 15px', border: 0, borderRadius: '8px', background: '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{checkingCompany ? '확인 중…' : '확인'}</button></div>
            </div>

            {companyCheckMessage && <p role="status" style={{ margin: '0 0 12px', padding: '9px 11px', borderRadius: '8px', background: companyCheck?.kind === 'existing' ? '#eff6ff' : companyCheck?.kind === 'new' ? '#f0fdf4' : '#fef2f2', color: companyCheck ? '#166534' : '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{companyCheckMessage}</p>}

            {companyCheck?.kind === 'new' && <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '7px' }}>참여 학생 명단 <small style={{ fontWeight: 400 }}>(필수)</small></label>
              {studentMembers.map((member, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr auto', gap: '6px', marginBottom: '6px' }}>
                <input aria-label={`학생 ${index + 1} 학번`} placeholder="학번" value={member.studentNumber} onChange={(event) => setStudentMembers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, studentNumber: event.target.value } : item))} style={{ minWidth: 0, padding: '9px', border: '1px solid #cbd5e1', borderRadius: '7px' }} />
                <input aria-label={`학생 ${index + 1} 이름`} placeholder="이름" value={member.name} onChange={(event) => setStudentMembers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} style={{ minWidth: 0, padding: '9px', border: '1px solid #cbd5e1', borderRadius: '7px' }} />
                <button type="button" aria-label={`학생 ${index + 1} 삭제`} disabled={studentMembers.length === 1} onClick={() => setStudentMembers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>−</button>
              </div>)}
              <button type="button" onClick={() => setStudentMembers((current) => [...current, { studentNumber: '', name: '' }])} style={{ width: '100%', padding: '7px', border: '1px dashed #94a3b8', borderRadius: '7px', background: '#fff' }}>＋ 학생 추가</button>
            </div>}

            {companyCheck?.kind === 'existing' && <div style={{ marginBottom: '18px', padding: '12px', border: '1px solid #bfdbfe', borderRadius: '10px', background: '#eff6ff' }}><strong style={{ display: 'block', marginBottom: '8px', color: '#1e3a8a' }}>참여 학생 명단</strong>{companyCheck.company.studentMembers?.length ? <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', fontSize: '13px' }}>{companyCheck.company.studentMembers.map((member) => <li key={member.studentNumber}>{member.studentNumber} · {member.name}</li>)}</ul> : <small style={{ color: '#64748b' }}>등록된 학생 명단이 없습니다.</small>}</div>}

            <button
              type="submit"
              disabled={!companyCheck || (companyCheck.kind === 'new' && !validNewMembers)}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                fontWeight: 700,
                color: '#ffffff',
                background: !companyCheck || (companyCheck.kind === 'new' && !validNewMembers) ? '#94a3b8' : '#2563eb',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              }}
            >
              {companyCheck?.kind === 'new' ? '회사 창립하기' : '회사 접속하기'}
            </button>
          </form>
        </div>

        {/* 교사 모드 진입 링크 */}
        <div style={{ textAlign: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '13px', color: '#64748b', marginRight: '8px' }}>선생님이신가요?</span>
          <button
            onClick={() => setTeacherLoginOpen((open) => !open)}
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
            👨‍🏫 교사용 대시보드
          </button>
          <button type="button" onClick={() => setQrOpen(true)} style={{ marginLeft: '7px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '6px', cursor: 'pointer' }}>📱 접속 QR</button>
          {teacherLoginOpen && <form onSubmit={(event) => { event.preventDefault(); if (teacherPassword !== '13579246') return alert('비밀번호가 올바르지 않습니다.'); sessionStorage.setItem('marketlab:teacher-auth', '1'); navigate('/teacher'); }} style={{ display: 'grid', gap: '7px', marginTop: '12px' }}><input aria-label="교사 비밀번호" type="password" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} placeholder="교사 비밀번호" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '7px' }} /><button type="submit" style={{ padding: '9px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 700 }}>확인</button></form>}
        </div>
      </div>
      {qrOpen && <div className="home-qr-overlay" role="dialog" aria-modal="true" aria-labelledby="home-qr-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setQrOpen(false); }}><section className="home-qr-modal"><div className="home-qr-heading"><h2 id="home-qr-title">📱 수업 접속 QR</h2><button type="button" onClick={() => setQrOpen(false)} aria-label="QR 코드 닫기">✕</button></div><p>학생들이 휴대전화 카메라로 스캔하면 로그인 화면으로 이동합니다.</p><div className="home-qr-code"><QRCodeSVG value={appUrl} size={260} level="H" includeMargin title="공급시뮬레이션 수업 접속 QR 코드" /></div><a href={appUrl}>{appUrl}</a><button type="button" className="home-qr-copy" onClick={() => void navigator.clipboard.writeText(appUrl)}>주소 복사</button></section></div>}
    </div>
  );
};
