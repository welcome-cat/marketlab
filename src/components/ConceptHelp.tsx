import React, { useEffect, useRef, useState } from 'react';

const explanations: Record<string, string> = {
  한계생산물: '노동자 1명을 더 고용했을 때 추가로 늘어나는 생산량입니다. 노동자가 계속 늘면 보통 한계생산물은 감소합니다.',
  한계비용: '제품을 1단위 더 생산할 때 추가로 드는 비용입니다. 경제학의 비용에는 기업을 계속 운영하는 데 필요한 최소 보상인 정상이윤도 포함해 생각합니다. 경쟁시장에서는 가격·평균수입·한계수입이 같으므로(P=AR=MR), 보통 MR=MC가 되는 생산량에서 이윤이 가장 커집니다.',
  평균비용: '총비용을 생산량으로 나눈 제품 1단위당 평균 비용입니다. 한계비용과는 서로 다른 개념입니다.',
  고정비: '생산량이 달라져도 이번 라운드에 부담하는 비용입니다. 이 시뮬레이션에서는 임대료와 이미 고용한 노동자의 임금이 대표적입니다.',
  가변비: '생산량이 늘수록 함께 증가하는 비용입니다. 제품 1개마다 필요한 재료비가 대표적입니다.',
  영업이익: '매출에서 임금·임대료·재료비 등 이번 생산활동의 비용을 뺀 값입니다.',
  이윤: '매출에서 생산비와 기계 감가상각, 기술·진입 투자비의 라운드 배분액까지 뺀 값입니다.',
  감가상각: '여러 라운드 동안 사용하는 기계의 구입비를 사용기간에 나누어 비용으로 반영하는 방식입니다.',
};

export const ConceptHelp: React.FC<{ concept: keyof typeof explanations }> = ({ concept }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  return <span ref={containerRef} style={{ display: 'inline-block', position: 'relative', marginLeft: '4px' }}>
    <button type="button" aria-label={`${concept} 설명 보기`} aria-expanded={open} title={`${concept} 설명 보기`} onClick={() => setOpen((current) => !current)} style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', padding: 0, border: 0, borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontSize: '12px', fontWeight: 900 }}>?</button>
    {open && <span role="dialog" aria-label={`${concept} 설명`} style={{ position: 'absolute', zIndex: 20, right: 0, width: '300px', padding: '12px 34px 12px 12px', marginTop: '5px', background: '#172554', color: '#fff', borderRadius: '9px', boxShadow: '0 8px 24px rgba(15,23,42,.2)', fontSize: '12px', lineHeight: 1.55, fontWeight: 400 }}>
      <strong style={{ display: 'block', marginBottom: '4px' }}>{concept}</strong>{explanations[concept]}
      <button type="button" aria-label={`${concept} 설명 닫기`} onClick={() => setOpen(false)} style={{ position: 'absolute', top: '6px', right: '7px', width: '24px', height: '24px', padding: 0, border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.14)', color: '#fff', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
    </span>}
  </span>;
};
