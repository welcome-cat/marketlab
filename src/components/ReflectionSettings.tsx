import React, { useState } from 'react';
import type { ReflectionSheet } from '../types/domain';

interface ReflectionSettingsProps {
  interval: number;
  sheets: ReflectionSheet[];
  onSave: (interval: number, sheets: ReflectionSheet[]) => Promise<void>;
}

const cloneSheets = (sheets: ReflectionSheet[]) => sheets.map((sheet) => ({ ...sheet, questions: sheet.questions.map((question) => ({ ...question })) }));

export const ReflectionSettings: React.FC<ReflectionSettingsProps> = ({ interval, sheets, onSave }) => {
  const [draftInterval, setDraftInterval] = useState(interval);
  const [draftSheets, setDraftSheets] = useState(() => cloneSheets(sheets));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    try {
      setSaving(true); setMessage(null);
      await onSave(draftInterval, draftSheets);
      setMessage('경제 활동지 설정을 저장했습니다.');
    } catch { setMessage('제목과 모든 문항을 입력했는지 확인해주세요.'); }
    finally { setSaving(false); }
  };

  return <div className="reflection-settings">
    <h3 style={{ marginTop: 0 }}>📝 경제 활동지 설정</h3>
    <p style={{ color: '#64748b', fontSize: '13px' }}>지정한 라운드 간격마다 활동지가 열립니다. 활동지가 여러 개면 제출 차례에 따라 순서대로 반복됩니다.</p>
    <label>제출 주기
      <span className="reflection-interval"><input type="number" min="1" max="20" step="1" value={draftInterval} onChange={(event) => setDraftInterval(Math.max(1, Math.min(20, Math.floor(Number(event.target.value) || 1))))} />라운드마다</span>
    </label>
    <div className="reflection-sheet-list">{draftSheets.map((sheet, sheetIndex) => <article key={sheet.id}>
      <div className="reflection-sheet-heading"><strong>활동지 {sheetIndex + 1}</strong><button type="button" disabled={draftSheets.length <= 1} onClick={() => setDraftSheets((current) => current.filter((_, index) => index !== sheetIndex))}>활동지 삭제</button></div>
      <label>활동지 제목<input maxLength={80} value={sheet.title} onChange={(event) => setDraftSheets((current) => current.map((item, index) => index === sheetIndex ? { ...item, title: event.target.value } : item))} /></label>
      {sheet.questions.map((question, questionIndex) => <div className="reflection-question-row" key={question.id}>
        <label>문항 {questionIndex + 1}<textarea rows={2} maxLength={300} value={question.prompt} onChange={(event) => setDraftSheets((current) => current.map((item, index) => index === sheetIndex ? { ...item, questions: item.questions.map((entry, entryIndex) => entryIndex === questionIndex ? { ...entry, prompt: event.target.value } : entry) } : item))} /></label>
        <button type="button" disabled={sheet.questions.length <= 1} onClick={() => setDraftSheets((current) => current.map((item, index) => index === sheetIndex ? { ...item, questions: item.questions.filter((_, entryIndex) => entryIndex !== questionIndex) } : item))}>문항 삭제</button>
      </div>)}
      <button type="button" disabled={sheet.questions.length >= 10} onClick={() => setDraftSheets((current) => current.map((item, index) => index === sheetIndex ? { ...item, questions: [...item.questions, { id: `question-${crypto.randomUUID()}`, prompt: '' }] } : item))}>＋ 문항 추가</button>
    </article>)}</div>
    <div className="reflection-settings-actions"><button type="button" disabled={draftSheets.length >= 20} onClick={() => setDraftSheets((current) => [...current, { id: `reflection-${crypto.randomUUID()}`, title: '새 경제 활동지', questions: [{ id: `question-${crypto.randomUUID()}`, prompt: '' }] }])}>＋ 활동지 추가</button><button type="button" disabled={saving} onClick={save}>{saving ? '저장 중...' : '활동지 설정 저장'}</button></div>
    {message ? <p role="status" className="reflection-settings-message">{message}</p> : null}
  </div>;
};
