import React from 'react';
import { calculateCompetitiveMarket, calculateMarketDemand, calculateRepresentativeMarketSupply } from '../services';
import type { Market, ProductionPlan } from '../types/domain';
import { FirmSupplyCurve } from './FirmSupplyCurve';

interface Props { market: Market; plans: ProductionPlan[]; demandMultiplier: number; }

export const MarketCurveChart: React.FC<Props> = ({ market, plans, demandMultiplier }) => {
  if (market.marketType !== 'PERFECT_COMPETITION') return null;
  const width = 520;
  const height = 300;
  const margin = { left: 76, right: 20, top: 22, bottom: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const quantityUnit = market.id === 'market_toy' ? '포대' : '개';
  const studentSupply = plans.reduce((sum, plan) => sum + plan.producedQuantity, 0);
  const competitiveMarket = calculateCompetitiveMarket(market, studentSupply, demandMultiplier);
  const shutdownPrice = Math.round(market.materialUnitCost * market.materialCostMultiplier + market.wagePerWorker / Math.max(1, market.firstWorkerProductivity));
  const backgroundSupply = (price: number) => calculateRepresentativeMarketSupply(market, price);
  const totalSupply = (price: number) => backgroundSupply(price) + (backgroundSupply(price) > 0 ? competitiveMarket.effectiveStudentSupply : 0);
  const minPrice = market.id === 'market_toy' ? 1000 : 300;
  const equilibriumPrice = Math.max(minPrice + 10, competitiveMarket.marketPrice);
  const maxPrice = equilibriumPrice * 2 - minPrice;
  const equilibriumQuantity = calculateMarketDemand(market, competitiveMarket.marketPrice, demandMultiplier);
  const maxQuantity = Math.max(20, equilibriumQuantity * 2);
  const x = (quantity: number) => margin.left + quantity / maxQuantity * innerWidth;
  const y = (price: number) => margin.top + innerHeight - (price - minPrice) / (maxPrice - minPrice) * innerHeight;
  const priceTicks = Array.from({ length: 5 }, (_, index) => minPrice + (maxPrice - minPrice) * index / 4);
  const quantityTicks = Array.from({ length: 5 }, (_, index) => maxQuantity * index / 4);
  const demandPrices = Array.from({ length: 31 }, (_, index) => minPrice + (maxPrice - minPrice) * index / 30);
  const demandPath = demandPrices.map((price, index) => `${index === 0 ? 'M' : 'L'} ${x(calculateMarketDemand(market, price, demandMultiplier))} ${y(price)}`).join(' ');
  // 카페는 기존의 균등 표본 2차곡선을 유지한다. 쌀만 500원 부근의
  // 곡률을 잘 보여주도록 낮은 가격 구간을 더 촘촘히 표본화한다.
  const isRiceMarket = market.id === 'market_toy';
  const supplyPointCount = isRiceMarket ? 61 : 31;
  const supplyPrices = Array.from({ length: supplyPointCount }, (_, index) => {
    const ratio = index / (supplyPointCount - 1);
    return minPrice + (maxPrice - minPrice) * (isRiceMarket ? Math.pow(ratio, 2) : ratio);
  });
  const supplyPoints = supplyPrices.map((price) => ({ price, background: backgroundSupply(price), total: totalSupply(price) })).filter((point) => point.background > 0.01);
  const backgroundSupplyPath = supplyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.background)} ${y(point.price)}`).join(' ');
  const totalSupplyPath = supplyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.total)} ${y(point.price)}`).join(' ');
  return <div style={{ minWidth: 0 }}>
    <h4 style={{ margin: '0 0 6px' }}>{market.icon} {market.name}</h4>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${market.name}의 가격별 수요량과 공급량`} style={{ width: '100%', height: 'auto' }}>
      <defs><clipPath id={`market-curve-${market.id}`}><rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} /></clipPath></defs>
      <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} fill="#fff" stroke="#cbd5e1" />
      {priceTicks.map((price) => <g key={`p-${price}`}><line x1={margin.left} y1={y(price)} x2={width - margin.right} y2={y(price)} stroke="#e2e8f0" /><text x={margin.left - 8} y={y(price) + 4} textAnchor="end" fontSize="10" fill="#475569">{Math.round(price).toLocaleString()}원</text></g>)}
      {quantityTicks.map((quantity) => <g key={`q-${quantity}`}><line x1={x(quantity)} y1={margin.top} x2={x(quantity)} y2={height - margin.bottom} stroke="#f1f5f9" /><text x={x(quantity)} y={height - margin.bottom + 17} textAnchor="middle" fontSize="10" fill="#475569">{Math.round(quantity).toLocaleString()}</text></g>)}
      <line x1={margin.left} y1={y(market.announcedPrice)} x2={width - margin.right} y2={y(market.announcedPrice)} stroke="#64748b" strokeDasharray="5 5" />
      <g clipPath={`url(#market-curve-${market.id})`}>
        <path d={demandPath} fill="none" stroke="#dc2626" strokeWidth="3" />
        <path d={backgroundSupplyPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
        <path d={totalSupplyPath} fill="none" stroke="#2563eb" strokeWidth="3" />
      </g>
      <circle cx={x(calculateMarketDemand(market, competitiveMarket.marketPrice, demandMultiplier))} cy={y(competitiveMarket.marketPrice)} r="5" fill="#16a34a" />
      <text x={x(calculateMarketDemand(market, maxPrice, demandMultiplier)) + 8} y={y(maxPrice) + 14} fill="#dc2626" fontSize="12" fontWeight="700">수요 D</text>
      <text x={x(totalSupply(maxPrice)) - 4} y={y(maxPrice) + 16} textAnchor="end" fill="#2563eb" fontSize="12" fontWeight="700">전체 공급 S</text>
      <text x={margin.left - 8} y={margin.top - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="#334155">P 가격</text>
      <text x={width - margin.right} y={height - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="#334155">Q 수량({quantityUnit})</text>
    </svg>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: '4px', fontSize: '12px', color: '#475569' }}>
      <strong>기준가격 {market.basePrice.toLocaleString()}원</strong><strong>기준수요 {market.demandAtBasePrice.toLocaleString()}{quantityUnit}</strong><strong>수요 가격탄력성 {market.priceElasticity.toFixed(2)}</strong><span>{market.priceElasticity > 1 ? '탄력적 수요' : '비탄력적 수요'}</span><strong>역공급함수 P(Q): 공급탄력성 {market.supplyElasticity.toFixed(2)}의 2차함수</strong>
    </div>
    {plans.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '8px', marginTop: '12px' }}>{plans.map((plan, index) => {
      const fallbackCost = Math.max(shutdownPrice, plan.marginalCost || shutdownPrice);
      const curvePoints = plan.supplyCurve?.length ? plan.supplyCurve : [{ quantity: plan.productionCapacity, marginalCost: fallbackCost }];
      return <div key={plan.id} style={{ padding: '8px', background: '#f8fafc', borderRadius: '8px' }}><FirmSupplyCurve points={curvePoints} selectedQuantity={plan.requestedQuantity} selectedMarginalCost={plan.marginalCost} quantityUnit={quantityUnit} title={`개별 기업 ${index + 1} 공급량`} compact /></div>;
    })}</div>}
  </div>;
};
