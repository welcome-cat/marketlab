import type { DemandEvent, DemandEventOption, Market } from '../types/domain';
import { DEMAND_EVENT_OPTIONS } from '../types/domain';

interface NewsArticle {
  headline: string;
  body: string;
  generatedBy: DemandEvent['generatedBy'];
}

const signals: Record<string, string[]> = {
  income_up: ['가계의 여유 자금이 늘면서 유통가의 주말 방문객이 눈에 띄게 늘었다', '최근 소비 관련 지표가 예상보다 견조한 흐름을 보이고 있다', '가계 지출 계획을 확대했다는 응답이 여러 조사에서 관찰됐다'],
  income_down: ['생활비 부담을 의식해 장바구니를 신중하게 꾸리는 소비자가 늘었다', '가계가 당분간 꼭 필요한 지출을 중심으로 소비 계획을 세우고 있다', '소비자들이 지출 시기를 늦추거나 비교 구매에 나서는 모습이다'],
  preference_up: ['온라인 커뮤니티와 영상 플랫폼에서 관련 제품을 소개하는 게시물이 빠르게 퍼지고 있다', '최근 거리와 학교 주변에서 관련 제품을 찾는 사람이 부쩍 눈에 띈다', '새로운 생활 방식이 주목받으며 관련 제품이 자주 언급되고 있다'],
  preference_down: ['온라인을 중심으로 해당 상품을 사지 않겠다는 움직임이 빠르게 번지고 있다', '일부 소비자 단체가 당분간 구매를 미루자는 목소리를 내고 있다', '판매 현장에서는 방문객이 제품을 살펴보고도 발길을 돌리는 사례가 늘었다'],
  substitute_up: ['비슷한 용도로 사용되는 상품의 원료비와 유통가격이 잇따라 조정되고 있다', '경쟁 품목의 가격표가 바뀌면서 소비자들의 비교 검색이 활발해졌다', '대체 가능한 제품군에서 가격 부담을 호소하는 반응이 늘고 있다'],
  substitute_down: ['비슷한 용도로 쓰이는 경쟁 상품이 잇따라 할인 행사에 들어갔다', '소비자들이 저렴해진 경쟁 품목과 가격을 비교하는 모습이 늘었다'],
  complement_up: ['함께 사용하는 주변 제품의 가격이 오르면서 묶음 구매를 고민하는 소비자가 늘었다', '관련 액세서리와 서비스 요금이 조정돼 전체 이용비용이 커졌다는 평가다', '제품 이용에 필요한 부가 품목의 가격표가 잇따라 바뀌고 있다'],
  complement_down: ['함께 사용하는 주변 제품의 가격이 낮아지면서 묶음 구매 부담이 줄었다', '관련 액세서리와 서비스 비용이 내려 제품을 함께 마련하려는 소비자가 눈에 띈다'],
  eco_preference: ['환경 영향을 따져 상품을 고르는 소비자가 늘면서 친환경 공정을 알리는 업체에 문의가 몰리고 있다', '가격이 비슷하다면 친환경 방식으로 만든 제품을 택하겠다는 응답이 여러 조사에서 늘었다'],
  expect_price_up: ['원료 조달 상황을 두고 다음 달 가격표가 달라질 수 있다는 전망이 나오고 있다', '유통업계에서는 향후 가격 조정 가능성을 언급하는 목소리가 커졌다', '소비자들 사이에서 필요한 제품을 미리 준비하려는 움직임이 포착됐다'],
  expect_price_down: ['신제품 출시와 할인 행사 소식이 이어지며 구매 시기를 저울질하는 분위기다', '다음 달 판촉 경쟁이 예상되면서 소비자들이 가격표를 더 지켜보고 있다', '유통업체의 재고 할인 가능성이 거론되며 관망하는 소비자가 늘었다'],
  consumers_up: ['새 학기와 지역 행사 영향으로 상권을 찾는 인구가 크게 늘었다', '최근 지역 내 가구와 방문객 수가 증가했다는 통계가 발표됐다', '새로운 소비층이 유입되며 유통업계가 영업시간을 확대하고 있다'],
  consumers_down: ['계절적 이동과 일정 변화로 주요 상권의 유동인구가 줄었다', '최근 지역을 찾는 방문객 수가 이전보다 감소한 것으로 나타났다', '일부 소비층이 온라인이나 다른 지역 시장으로 이동하는 모습이다'],
  baseline: ['시장에서는 뚜렷한 변화 없이 평소와 비슷한 소비 흐름이 이어지고 있다'],
  supply_baseline: ['생산 현장에서는 원료 조달과 출하 일정이 대체로 평소 수준을 유지하고 있다'],
  material_up: ['주요 원재료의 도매가격이 오르며 업체들의 제품 한 단위당 부담이 커졌다', '생산업체들이 원료 구매 계약을 다시 검토하고 있다는 소식이 전해졌다'],
  material_down: ['주요 원재료의 도매가격이 안정되며 업체들의 제품 한 단위당 부담이 줄었다', '원료 조달 여건이 좋아져 생산 일정에 여유가 생겼다는 반응이 나온다'],
  wage_up: ['구인 경쟁이 치열해지면서 현장 인건비가 이전보다 높아졌다', '업체들은 같은 인력을 유지하는 데 필요한 비용이 늘었다고 전했다'],
  wage_down: ['노동시장 여건이 안정되며 현장 인건비 부담이 이전보다 낮아졌다', '업체들이 필요한 인력을 확보하기 한결 수월해졌다는 반응을 보였다'],
  rent_up: ['사업장 임대계약 갱신을 앞둔 업체들이 높아진 임대료에 부담을 호소하고 있다', '고정적으로 지출되는 사업장 비용이 업체들의 생산 계획에 변수로 떠올랐다'],
  rent_down: ['상권 임대료가 안정되며 사업장을 운영하는 업체들의 고정비 부담이 줄었다', '일부 업체는 절감한 운영비를 생산 활동에 활용할 계획이라고 밝혔다'],
  technology_progress: ['업계에 새로운 생산 공정이 빠르게 보급되며 같은 설비로 더 많은 제품을 만들 수 있게 됐다', '생산 현장에서는 작업 시간이 줄고 불량률도 낮아졌다는 평가가 나온다'],
  suppliers_up: ['새 업체들이 잇따라 시장에 진입하며 납품 경쟁이 한층 치열해졌다', '도매시장에는 여러 생산자가 내놓은 물량이 전보다 자주 눈에 띈다'],
  suppliers_down: ['일부 업체가 영업을 중단하면서 시장에 제품을 내놓는 사업자가 줄었다', '유통업계는 거래 가능한 납품처를 확보하기 위해 분주한 모습이다'],
  producer_expect_up: ['향후 더 나은 가격을 기대하는 생산자들이 당장 내놓을 물량을 창고에 보관하고 있다', '도매상들은 계약을 서두르고 있지만 출하를 미루려는 업체가 늘었다고 전했다'],
  producer_expect_down: ['앞으로 가격이 약해질 수 있다는 전망에 생산자들이 보유 물량을 서둘러 내놓고 있다', '도매시장에서는 평소보다 이른 출하가 이어지는 모습이다'],
  rice_typhoon: ['태풍이 주요 산지를 지나면서 벼 쓰러짐과 침수 피해 신고가 이어지고 있다', '산지 관계자들은 당초 계획한 수확량을 모두 확보하기 어려울 수 있다고 내다봤다'],
  producer_tax: ['생산 단계에 새로 부과되는 세금으로 업체들의 제품 한 단위당 부담이 커졌다', '업계는 기존 가격과 생산 계획을 그대로 유지할 수 있을지 계산에 들어갔다'],
  producer_subsidy: ['생산 실적에 따른 지원금 지급이 시작되며 업체들의 제품 한 단위당 부담이 줄었다', '업계에서는 미뤄 두었던 생산 계획을 다시 검토하는 움직임이 나타났다'],
};

const signalFor = (option: DemandEventOption, index = 0) => {
  const candidates = signals[option.id] || [option.description];
  if (candidates[index]) return candidates[index];
  if (option.id === 'baseline') return '소비자들의 구매 빈도와 장바구니 구성에서도 뚜렷한 변화가 포착되지 않았다';
  if (option.id === 'supply_baseline') return '업체들이 시장에 내놓는 물량과 생산 일정도 예년과 비슷한 수준을 보이고 있다';
  if (option.effectType === 'SUPPLY') return '현장 관계자들은 이러한 생산 여건이 업체들의 출하 결정에 중요한 변수가 될 것으로 보고 있다';
  return '판매업계는 이러한 소비자 행동이 실제 구매로 얼마나 이어질지 예의주시하고 있다';
};

export const defaultNewsTemplates = (): Record<string, { headline: string; body: string }> => Object.fromEntries(
  DEMAND_EVENT_OPTIONS
    .filter((option) => !['baseline', 'supply_baseline'].includes(option.id))
    .map((option) => [option.id, {
      headline: ({
        income_up: '지갑에 생긴 여유, 유통가 방문과 구매 계획에 온기', income_down: '생활비 부담 커진 가계, 장바구니부터 다시 살핀다',
        preference_up: '온라인 달군 새 유행, 매장 문의도 빠르게 늘어', preference_down: '번지는 단기 불매 움직임, 구매 직전 발길 돌리는 소비자들',
        eco_preference: '가격 같다면 친환경 제품…소비자의 선택 기준 달라졌다', substitute_up: '경쟁 상품 가격표 바뀌자 비교 구매 움직임 분주',
        substitute_down: '경쟁 상품 할인 확산, 소비자 시선 저렴한 대안으로', complement_up: '함께 쓰는 상품 가격 올라 묶음 구매 부담 커져',
        complement_down: '관련 상품 가격 안정, 함께 구매하려는 발길 늘어', expect_price_up: '“더 오르기 전에 사자”…구매 서두르는 소비자들',
        expect_price_down: '할인 기대감에 지갑 닫은 소비자, 구매 시기 저울질', consumers_up: '새 소비층 유입에 상권 활기…매장 방문객 증가',
        consumers_down: '상권 떠나는 소비층…한산해진 매장과 줄어든 문의', material_up: '원재료값 상승에 생산업계 긴장…원가 계산 다시 한다',
        material_down: '원료 조달비 안정…생산 계획에 여유 생긴 업체들', wage_up: '구인 경쟁에 인건비 상승…생산 현장 비용 부담 확대',
        wage_down: '인력 확보 여건 개선…업체들 생산 일정 재검토', rent_up: '오른 임대료에 고정비 부담…사업장 운영 전략 고심',
        rent_down: '임대료 안정에 숨통 트인 업체들, 생산 여력 점검', technology_progress: '새 공정 확산으로 작업시간 단축…생산 현장 효율 개선',
        suppliers_up: '새 업체 잇단 진입…도매시장 출하 경쟁 치열', suppliers_down: '생산자 이탈에 납품처 감소…유통업계 물량 확보 분주',
        producer_expect_up: '더 나은 가격 기다리는 생산자들, 출하 대신 보관 선택', producer_expect_down: '가격 약세 전망에 출하 서두르는 생산업계',
        rice_typhoon: '태풍 지나간 산지, 침수·쓰러짐 피해에 수확량 우려', producer_tax: '생산 단계 새 세금…업체들 단위당 비용 재산정',
        producer_subsidy: '생산 지원금 지급 시작…미뤘던 생산계획 다시 꺼낸다',
      } as Record<string, string>)[option.id] || `${option.title}, 시장 참여자 움직임에 변수`,
      body: [
        option.effectType === 'SUPPLY' ? '최근 생산과 출하 현장에서 평소와 다른 움직임이 관찰되고 있다.' : '최근 소비 현장에서 평소와 다른 움직임이 관찰되고 있다.',
        `${signalFor(option, 0)}.`,
        `${signalFor(option, 1)}.`,
        option.effectType === 'SUPPLY' ? '업체들은 비용과 생산능력, 시장에 내놓을 물량을 다시 계산하고 있다.' : '유통업계는 방문객 수와 구매 시기, 상품 비교 방식의 변화를 주시하고 있다.',
        option.effectType === 'SUPPLY' ? '도매시장 관계자들은 실제 출하 물량이 확인될 때까지 상황을 지켜봐야 한다고 전했다.' : '아직 실제 거래 결과가 나오지 않아 소비자의 최종 선택을 단정하기는 이르다.',
        '시장 참여 기업들은 기사 속 단서를 바탕으로 다음 거래의 가격과 물량 전략을 세워야 할 것으로 보인다.',
      ].join('\n'),
    }]),
);

export const composeEventArticle = (market: Market, option: DemandEventOption, section: 'CONSUMER' | 'PRODUCTION'): NewsArticle => ({
  headline: section === 'CONSUMER'
    ? `${market.name} 소비자 리포트…구매 현장에 포착된 변화`
    : `${market.name} 생산 동향…업계의 비용과 출하 여건 주목`,
  body: [
    section === 'CONSUMER'
      ? `최근 ${market.name}의 소비 현장에서 눈여겨볼 움직임이 관찰되고 있다.`
      : `최근 ${market.name}의 생산과 출하 현장에서 새로운 움직임이 관찰되고 있다.`,
    `${signalFor(option, 0)}.`,
    `${signalFor(option, 1)}.`,
    section === 'CONSUMER'
      ? '유통업계는 방문객 수와 구매 시기, 상품을 비교하는 방식이 이전과 달라지는지 살피고 있다.'
      : '생산업체들은 비용과 생산능력, 시장에 내놓을 물량을 다시 계산하고 있다.',
    section === 'CONSUMER'
      ? '아직 실제 거래 결과가 나오지 않아 소비자의 최종 선택을 단정하기는 이르다.'
      : '도매시장 관계자들은 실제 출하 물량이 확인될 때까지 상황을 지켜봐야 한다고 전했다.',
    '시장 참여 기업들은 기사에 나타난 행동의 변화를 바탕으로 다음 거래를 준비해야 할 것으로 보인다.',
  ].join('\n'),
  generatedBy: 'TEMPLATE',
});

export const composeMarketArticle = (market: Market, demand: DemandEventOption, supply: DemandEventOption): NewsArticle => {
  const bothQuiet = demand.id === 'baseline' && supply.id === 'supply_baseline';
  return {
    headline: bothQuiet ? `${market.name}, 큰 변수 없이 관망세 이어져` : `${market.name}, 소비 현장과 생산 여건에 새로운 변수 등장`,
    body: [
      bothQuiet
        ? `최근 ${market.name}을 둘러싼 소비와 생산 현장은 대체로 평소와 비슷한 흐름을 보이고 있다.`
        : `최근 ${market.name}을 둘러싼 소비와 생산 현장에서 평소와 다른 움직임이 관찰되고 있다.`,
      `${signalFor(demand, 0)}.`,
      `${signalFor(demand, 1)}.`,
      '유통 관계자들은 소비자들이 구매 여부와 시기를 이전보다 신중하게 결정하고 있다고 전했다.',
      `${signalFor(supply, 0)}.`,
      `${signalFor(supply, 1)}.`,
      '생산업체들은 기존 생산 계획을 유지할지, 투입량과 출하 시기를 조정할지 검토에 들어갔다.',
      '시장에서는 사고자와 팔고자 하는 쪽의 움직임이 동시에 달라질 가능성에 주목하고 있다.',
      '다만 아직 실제 거래가 충분히 이뤄지지 않아 새로운 가격 수준을 단정하기는 이르다는 평가다.',
      '기업들은 공개된 단서와 판매 현장의 반응을 바탕으로 이번 라운드의 가격과 물량 전략을 세워야 할 것으로 보인다.',
    ].join('\n'),
    generatedBy: 'TEMPLATE',
  };
};

const makeTemplateArticle = (market: Market, option: DemandEventOption): NewsArticle => {
  const candidates = signals[option.id] || [option.description];
  const signal = candidates[Math.floor(Math.random() * candidates.length)];
  const prefixes = ['생활경제', '유통가 소식', '시장 동향', '오늘의 산업'];
  const suffixes = ['업계는 당분간 소비자 반응을 지켜볼 필요가 있다고 전했다.', '판매 현장에서는 다음 주 움직임에 관심을 기울이고 있다.', '전문가들은 기업마다 상황을 다르게 해석할 수 있다고 덧붙였다.'];
  return {
    headline: `${prefixes[Math.floor(Math.random() * prefixes.length)]} | ${market.name} 주변에 감지된 변화`,
    body: `${signal}. ${suffixes[Math.floor(Math.random() * suffixes.length)]}`,
    generatedBy: 'TEMPLATE',
  };
};

export const newsService = {
  generateDemandArticle: async (market: Market, option: DemandEventOption): Promise<NewsArticle> => {
    const functionUrl = import.meta.env.VITE_NEWS_FUNCTION_URL as string | undefined;
    if (functionUrl) {
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketName: market.name,
            factor: option.factor,
            eventTitle: option.title,
            eventDescription: option.description,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const article = await response.json() as { headline?: string; body?: string };
          if (article.headline && article.body) return { ...article, generatedBy: 'AI' } as NewsArticle;
        }
      } catch {
        // 로컬 개발이나 함수 장애 시 수업이 멈추지 않도록 템플릿 기사로 대체한다.
      }
    }
    return makeTemplateArticle(market, option);
  },
};
