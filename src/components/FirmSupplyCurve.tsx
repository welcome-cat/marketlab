import React from 'react';

interface Props {
  points: Array<{ quantity: number; marginalCost: number }>;
  selectedQuantity?: number;
  selectedMarginalCost?: number | null;
  quantityUnit: string;
  title?: string;
  compact?: boolean;
  marketPrice?: number;
  marketPriceLabel?: string;
  showCurve?: boolean;
  showSurplus?: boolean;
}

export const FirmSupplyCurve: React.FC<Props> = ({ points, selectedQuantity, selectedMarginalCost, quantityUnit, title = '우리 기업의 공급량', compact = false, marketPrice, marketPriceLabel = '시장가격', showCurve = true, showSurplus = false }) => {
  if (points.length === 0) return null;
  // 먼 구간의 매우 높은 한계비용이 P=MC 주변을 납작하게 만들지 않도록
  // 시장가격의 1.8배를 처음 넘는 점까지만 차트에 표시한다.
  const chartCeiling = marketPrice === undefined ? Number.POSITIVE_INFINITY : marketPrice * 1.8;
  const firstPointAboveCeiling = points.findIndex((point) => point.marginalCost > chartCeiling);
  const chartPoints = firstPointAboveCeiling > 0 ? points.slice(0, firstPointAboveCeiling + 1) : points;
  const width = compact ? 240 : 520;
  const height = compact ? 150 : 260;
  const margin = compact ? { left: 52, right: 12, top: 16, bottom: 34 } : { left: 72, right: 20, top: 22, bottom: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const costs = [...chartPoints.map((point) => point.marginalCost), ...(marketPrice ? [marketPrice] : [])];
  const rawMinCost = Math.min(...costs);
  const rawMaxCost = Math.max(...costs);
  const costPadding = Math.max(10, (rawMaxCost - rawMinCost) * 0.12);
  const minCost = Math.max(0, rawMinCost - costPadding);
  const maxCost = rawMaxCost + costPadding;
  const maxQuantity = Math.max(1, chartPoints.at(-1)?.quantity || 1);
  const x = (quantity: number) => margin.left + Math.min(maxQuantity, Math.max(0, quantity)) / maxQuantity * innerWidth;
  const y = (cost: number) => margin.top + innerHeight - (cost - minCost) / Math.max(1, maxCost - minCost) * innerHeight;
  const chosenQuantity = Math.min(maxQuantity, Math.max(0, selectedQuantity || 0));
  const chosenCost = selectedMarginalCost ?? points.find((point) => chosenQuantity <= point.quantity)?.marginalCost;
  const priceTicks = [minCost, (minCost + maxCost) / 2, maxCost];
  const quantityTicks = [0, maxQuantity / 2, maxQuantity];
  const curvePoints = [{ quantity: 0, marginalCost: chartPoints[0].marginalCost }, ...chartPoints];
  const firstPointAbovePrice = marketPrice === undefined ? -1 : points.findIndex((point) => point.marginalCost > marketPrice);
  const optimalPoint = firstPointAbovePrice > 0 ? points[firstPointAbovePrice - 1] : undefined;
  // 각 노동자의 생산 묶음을 생산량 축의 구간으로 바꿔 그린다.
  // 따라서 파란 영역의 폭은 노동자 수가 아니라 실제 생산량을 뜻한다.
  const surplusIntervals = marketPrice === undefined ? [] : chartPoints.map((point, index) => ({
    start: chartPoints[index - 1]?.quantity || 0,
    end: Math.min(point.quantity, chosenQuantity),
    marginalCost: point.marginalCost,
  })).filter((interval) => interval.end > interval.start && interval.marginalCost < marketPrice);

  return <div style={{ minWidth: 0 }}>
    <strong style={{ display: 'block', fontSize: compact ? '12px' : '14px', marginBottom: '4px' }}>{title}</strong>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: 생산량별 한계비용`} style={{ width: '100%', height: 'auto' }}>
      <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} fill="#fff" stroke="#cbd5e1" />
      {priceTicks.map((cost) => <g key={cost}><line x1={margin.left} y1={y(cost)} x2={width - margin.right} y2={y(cost)} stroke="#eef2f7" /><text x={margin.left - 6} y={y(cost) + 4} textAnchor="end" fontSize={compact ? 8 : 10} fill="#475569">{Math.round(cost).toLocaleString()}원</text></g>)}
      {quantityTicks.map((quantity) => <g key={quantity}><line x1={x(quantity)} y1={margin.top} x2={x(quantity)} y2={height - margin.bottom} stroke="#f1f5f9" /><text x={x(quantity)} y={height - margin.bottom + 16} textAnchor="middle" fontSize={compact ? 8 : 10} fill="#475569">{Math.round(quantity).toLocaleString()}</text></g>)}
      {showSurplus && marketPrice !== undefined && chosenQuantity > 0 && surplusIntervals.map((interval, index) => <rect key={`${interval.start}-${interval.end}-${index}`} x={x(interval.start)} y={y(marketPrice)} width={Math.max(0, x(interval.end) - x(interval.start))} height={Math.max(0, y(interval.marginalCost) - y(marketPrice))} fill="#60a5fa" opacity="0.4" />)}
      {marketPrice !== undefined && <><line x1={margin.left} y1={y(marketPrice)} x2={width - margin.right} y2={y(marketPrice)} stroke="#2563eb" strokeWidth="2" strokeDasharray="5 3" /><text x={margin.left + 5} y={y(marketPrice) - 5} fontSize="10" fill="#1d4ed8">{marketPriceLabel}</text></>}
      {showCurve && <polyline points={curvePoints.map((point) => `${x(point.quantity)},${y(point.marginalCost)}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" />}
      {showCurve && optimalPoint && <><line x1={x(optimalPoint.quantity)} y1={y(optimalPoint.marginalCost)} x2={x(optimalPoint.quantity)} y2={height - margin.bottom} stroke="#059669" strokeDasharray="4 3" /><circle cx={x(optimalPoint.quantity)} cy={y(optimalPoint.marginalCost)} r={compact ? 3 : 5} fill="#059669" /><text x={x(optimalPoint.quantity) + 6} y={y(optimalPoint.marginalCost) - 7} fontSize="10" fill="#047857">P≈MC</text></>}
      {chosenQuantity > 0 && chosenCost !== undefined && <><line x1={x(chosenQuantity)} y1={y(chosenCost)} x2={x(chosenQuantity)} y2={height - margin.bottom} stroke="#f59e0b" strokeDasharray="4 3" /><circle cx={x(chosenQuantity)} cy={y(chosenCost)} r={compact ? 3 : 5} fill="#f59e0b" /></>}
      <text x={margin.left - 4} y={margin.top - 6} textAnchor="end" fontSize={compact ? 8 : 10} fontWeight="700">P 한계비용</text>
      <text x={width - margin.right} y={height - 5} textAnchor="end" fontSize={compact ? 8 : 10} fontWeight="700">Q 생산량({quantityUnit})</text>
    </svg>
    {!compact && chosenQuantity > 0 && chosenCost !== undefined && <strong style={{ display: 'block', color: '#b45309', fontSize: '13px' }}>● 우리 기업의 희망 공급량 {chosenQuantity.toLocaleString()}{quantityUnit} · 한계비용 {chosenCost.toLocaleString()}원</strong>}
    {!compact && showSurplus && marketPrice !== undefined && chosenCost !== undefined && <small style={{ display: 'block', color: '#1d4ed8', marginTop: '4px' }}>파란 영역은 시장가격과 각 생산단위의 한계비용 차이입니다. 현재 마지막 1{quantityUnit}의 추가이윤은 약 {Math.max(0, marketPrice - chosenCost).toLocaleString()}원입니다.</small>}
  </div>;
};
