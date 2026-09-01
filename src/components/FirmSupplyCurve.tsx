import React from 'react';

interface Props {
  points: Array<{ quantity: number; marginalCost: number }>;
  selectedQuantity?: number;
  selectedMarginalCost?: number | null;
  quantityUnit: string;
  title?: string;
  compact?: boolean;
}

export const FirmSupplyCurve: React.FC<Props> = ({ points, selectedQuantity, selectedMarginalCost, quantityUnit, title = '우리 기업의 공급량', compact = false }) => {
  if (points.length === 0) return null;
  const width = compact ? 240 : 520;
  const height = compact ? 150 : 260;
  const margin = compact ? { left: 52, right: 12, top: 16, bottom: 34 } : { left: 72, right: 20, top: 22, bottom: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const costs = points.map((point) => point.marginalCost);
  const rawMinCost = Math.min(...costs);
  const rawMaxCost = Math.max(...costs);
  const costPadding = Math.max(10, (rawMaxCost - rawMinCost) * 0.12);
  const minCost = Math.max(0, rawMinCost - costPadding);
  const maxCost = rawMaxCost + costPadding;
  const maxQuantity = Math.max(1, points.at(-1)?.quantity || 1);
  const x = (quantity: number) => margin.left + Math.min(maxQuantity, Math.max(0, quantity)) / maxQuantity * innerWidth;
  const y = (cost: number) => margin.top + innerHeight - (cost - minCost) / Math.max(1, maxCost - minCost) * innerHeight;
  const chosenQuantity = Math.min(maxQuantity, Math.max(0, selectedQuantity || 0));
  const chosenCost = selectedMarginalCost ?? points.find((point) => chosenQuantity <= point.quantity)?.marginalCost;
  const priceTicks = [minCost, (minCost + maxCost) / 2, maxCost];
  const quantityTicks = [0, maxQuantity / 2, maxQuantity];

  return <div style={{ minWidth: 0 }}>
    <strong style={{ display: 'block', fontSize: compact ? '12px' : '14px', marginBottom: '4px' }}>{title}</strong>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: 생산량별 한계비용`} style={{ width: '100%', height: 'auto' }}>
      <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} fill="#fff" stroke="#cbd5e1" />
      {priceTicks.map((cost) => <g key={cost}><line x1={margin.left} y1={y(cost)} x2={width - margin.right} y2={y(cost)} stroke="#eef2f7" /><text x={margin.left - 6} y={y(cost) + 4} textAnchor="end" fontSize={compact ? 8 : 10} fill="#475569">{Math.round(cost).toLocaleString()}원</text></g>)}
      {quantityTicks.map((quantity) => <g key={quantity}><line x1={x(quantity)} y1={margin.top} x2={x(quantity)} y2={height - margin.bottom} stroke="#f1f5f9" /><text x={x(quantity)} y={height - margin.bottom + 16} textAnchor="middle" fontSize={compact ? 8 : 10} fill="#475569">{Math.round(quantity).toLocaleString()}</text></g>)}
      {chosenQuantity > 0 && chosenCost !== undefined && <><line x1={x(chosenQuantity)} y1={y(chosenCost)} x2={x(chosenQuantity)} y2={height - margin.bottom} stroke="#f59e0b" strokeDasharray="4 3" /><circle cx={x(chosenQuantity)} cy={y(chosenCost)} r={compact ? 3 : 5} fill="#f59e0b" /></>}
      <text x={margin.left - 4} y={margin.top - 6} textAnchor="end" fontSize={compact ? 8 : 10} fontWeight="700">P 한계비용</text>
      <text x={width - margin.right} y={height - 5} textAnchor="end" fontSize={compact ? 8 : 10} fontWeight="700">Q 생산량({quantityUnit})</text>
    </svg>
    {!compact && chosenQuantity > 0 && chosenCost !== undefined && <strong style={{ display: 'block', color: '#b45309', fontSize: '13px' }}>● 우리 기업의 희망 공급량 {chosenQuantity.toLocaleString()}{quantityUnit} · 한계비용 {chosenCost.toLocaleString()}원</strong>}
  </div>;
};
