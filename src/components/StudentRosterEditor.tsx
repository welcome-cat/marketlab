import React, { useState } from 'react';
import type { StudentMember } from '../types/domain';

interface StudentRosterEditorProps {
  initialMembers: StudentMember[];
  onSave: (members: StudentMember[]) => Promise<void>;
  onClose?: () => void;
}

export const StudentRosterEditor: React.FC<StudentRosterEditorProps> = ({ initialMembers, onSave, onClose }) => {
  const [members, setMembers] = useState<StudentMember[]>(() => initialMembers.length ? initialMembers.map((member) => ({ ...member })) : [{ studentNumber: '', name: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const normalized = members.map((member) => ({ studentNumber: member.studentNumber.trim(), name: member.name.trim() }));
    if (normalized.some((member) => !member.studentNumber || !member.name)) return setError('모든 학생의 학번과 이름을 입력해주세요.');
    if (new Set(normalized.map((member) => member.studentNumber)).size !== normalized.length) return setError('같은 학번을 두 번 등록할 수 없습니다.');
    try {
      setSaving(true);
      setError(null);
      await onSave(normalized);
      onClose?.();
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'INVALID_STUDENT_MEMBERS' ? '학번과 이름을 확인해주세요.' : '학생 명단을 저장하지 못했습니다.');
    } finally { setSaving(false); }
  };

  return <div className="student-roster-editor">
    {members.map((member, index) => <div className="student-roster-row" key={index}>
      <input aria-label={`학생 ${index + 1} 학번`} placeholder="학번" value={member.studentNumber} onChange={(event) => setMembers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, studentNumber: event.target.value } : item))} />
      <input aria-label={`학생 ${index + 1} 이름`} placeholder="이름" value={member.name} onChange={(event) => setMembers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
      <button type="button" aria-label={`학생 ${index + 1} 삭제`} disabled={members.length === 1} onClick={() => setMembers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>삭제</button>
    </div>)}
    <button type="button" onClick={() => setMembers((current) => [...current, { studentNumber: '', name: '' }])} disabled={members.length >= 30}>＋ 학생 추가</button>
    {error ? <p role="alert" className="roster-error">{error}</p> : null}
    <div className="roster-actions">{onClose ? <button type="button" onClick={onClose} disabled={saving}>취소</button> : null}<button type="button" onClick={save} disabled={saving}>{saving ? '저장 중...' : '명단 저장'}</button></div>
  </div>;
};
