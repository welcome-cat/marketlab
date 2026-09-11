import React from 'react';
import { machineCurrentValue, machineDepreciationRate } from '../services';
import type { Company, Market } from '../types/domain';

interface Props {
  company: Company;
  markets: Market[];
  currentRound: number;
}

export const MachineAssetSummary: React.FC<Props> = ({ company, markets, currentRound }) => {
  const assets = company.machineAssets || [];
  if (!assets.length) return <p className="machine-assets-empty">구입한 기계가 없습니다. 기본 지급 기계는 구매가격이 없어 자산가치 계산에서 제외됩니다.</p>;
  return <div className="machine-assets-summary">
    <strong>🏭 보유 기계 감가·현재가치</strong>
    <div className="machine-assets-list">{assets.map((asset) => {
      const depreciationRate = machineDepreciationRate(asset, currentRound);
      return <article key={asset.id}>
        <span>{markets.find((market) => market.id === asset.marketId)?.name || '공용 기계'} · {asset.quantity}대</span>
        <small>구입가 {asset.purchasePrice.toLocaleString()}원/대 · 감가율 {(depreciationRate * 100).toFixed(0)}%</small>
        <b>현재가치 {machineCurrentValue(asset, currentRound).toLocaleString()}원</b>
      </article>;
    })}</div>
  </div>;
};
