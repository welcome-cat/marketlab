import React from 'react';

const explanations: Record<string, string> = {
  한계생산물: '노동자 1명을 더 고용했을 때 추가로 늘어나는 생산량입니다. 노동자가 계속 늘면 보통 한계생산물은 감소합니다.',
  한계비용: '제품을 1단위 더 생산할 때 추가로 드는 비용입니다. 한계생산물이 감소하면 같은 임금으로 만들 수 있는 수량이 줄어 한계비용이 커집니다.',
  평균비용: '총비용을 생산량으로 나눈 제품 1단위당 평균 비용입니다. 한계비용과는 서로 다른 개념입니다.',
  고정비: '생산량이 달라져도 이번 라운드에 부담하는 비용입니다. 이 시뮬레이션에서는 임대료와 이미 고용한 노동자의 임금이 대표적입니다.',
  가변비: '생산량이 늘수록 함께 증가하는 비용입니다. 제품 1개마다 필요한 재료비가 대표적입니다.',
  영업이익: '매출에서 임금·임대료·재료비 등 이번 생산활동의 비용을 뺀 값입니다.',
  경제적이윤: '영업이익에서 기계 감가상각과 기술·진입 투자비의 라운드 배분액까지 뺀 값입니다.',
  감가상각: '여러 라운드 동안 사용하는 기계의 구입비를 사용기간에 나누어 비용으로 반영하는 방식입니다.',
};

export const ConceptHelp: React.FC<{ concept: keyof typeof explanations }> = ({ concept }) => <details style={{ display: 'inline-block', position: 'relative', marginLeft: '4px' }}>
  <summary aria-label={`${concept} 설명 보기`} title={`${concept} 설명 보기`} style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontSize: '12px', fontWeight: 900, listStyle: 'none' }}>?</summary>
  <span style={{ position: 'absolute', zIndex: 20, right: 0, width: '280px', padding: '11px', marginTop: '5px', background: '#172554', color: '#fff', borderRadius: '9px', boxShadow: '0 8px 24px rgba(15,23,42,.2)', fontSize: '12px', lineHeight: 1.55, fontWeight: 400 }}><strong style={{ display: 'block', marginBottom: '4px' }}>{concept}</strong>{explanations[concept]}</span>
</details>;
