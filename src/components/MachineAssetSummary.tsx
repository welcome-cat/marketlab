import React, { useState } from 'react';
import { machineCurrentValue, machineDepreciationRate } from '../services';
import type { Company, Market } from '../types/domain';

interface Props {
  company: Company;
  markets: Market[];
  currentRound: number;
}

export const MachineAssetSummary: React.FC<Props> = ({ company, markets, currentRound }) => {
  const [expanded, setExpanded] = useState(false);
  const assets = company.machineAssets || [];
  if (!assets.length) return <p className="machine-assets-empty">구입한 기계가 없습니다. 기본 지급 기계는 구매가격이 없어 자산가치 계산에서 제외됩니다.</p>;
  const machines = assets.flatMap((asset) => Array.from({ length: asset.quantity }, (_, unitIndex) => ({
    ...asset,
    id: `${asset.id}-${unitIndex + 1}`,
    quantity: 1,
  })));
  const renderMachines = (popup = false) => <div className={`machine-assets-list ${popup ? 'is-popup' : ''}`}>{machines.map((machine, index) => {
    const depreciationRate = machineDepreciationRate(machine, currentRound);
    return <article key={machine.id}>
      <span>{markets.find((market) => market.id === machine.marketId)?.name || '공용 기계'} · 기계 {index + 1}</span>
      <small>구입가 {machine.purchasePrice.toLocaleString()}원 · 감가율 {(depreciationRate * 100).toFixed(0)}%</small>
      <b>현재가치 {machineCurrentValue(machine, currentRound).toLocaleString()}원</b>
    </article>;
  })}</div>;
  return <div className="machine-assets-summary">
    <div className="machine-assets-heading"><strong>🏭 보유 기계 감가·현재가치</strong><button type="button" onClick={() => setExpanded(true)} aria-label="보유 기계 전체보기" title="팝업으로 크게 보기">🔍</button></div>
    {renderMachines()}
    {expanded && <div className="machine-assets-overlay" role="dialog" aria-modal="true" aria-labelledby="machine-assets-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}><section className="machine-assets-modal"><div className="machine-assets-modal-heading"><h2 id="machine-assets-title">🏭 보유 기계 전체보기 ({machines.length}대)</h2><button type="button" onClick={() => setExpanded(false)} aria-label="보유 기계 전체보기 닫기">✕</button></div>{renderMachines(true)}</section></div>}
  </div>;
};
