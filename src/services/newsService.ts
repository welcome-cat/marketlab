import type { DemandEvent, DemandEventOption, Market } from '../types/domain';

interface NewsArticle {
  headline: string;
  body: string;
  generatedBy: DemandEvent['generatedBy'];
}

const signals: Record<string, string[]> = {
  income_up: ['가계의 여유 자금이 늘면서 유통가의 주말 방문객이 눈에 띄게 늘었다', '최근 소비 관련 지표가 예상보다 견조한 흐름을 보이고 있다', '가계 지출 계획을 확대했다는 응답이 여러 조사에서 관찰됐다'],
  income_down: ['생활비 부담을 의식해 장바구니를 신중하게 꾸리는 소비자가 늘었다', '가계가 당분간 꼭 필요한 지출을 중심으로 소비 계획을 세우고 있다', '소비자들이 지출 시기를 늦추거나 비교 구매에 나서는 모습이다'],
  preference_up: ['온라인 커뮤니티와 영상 플랫폼에서 관련 제품을 소개하는 게시물이 빠르게 퍼지고 있다', '최근 거리와 학교 주변에서 관련 제품을 찾는 사람이 부쩍 눈에 띈다', '새로운 생활 방식이 주목받으며 관련 제품이 자주 언급되고 있다'],
  preference_down: ['최근 소비자의 관심이 새로운 형태의 제품과 서비스로 옮겨가는 모습이다', '관련 제품의 검색량과 온라인 언급이 이전보다 차분해졌다', '유통업계가 진열 공간을 다른 인기 품목으로 조정하고 있다'],
  substitute_up: ['비슷한 용도로 사용되는 상품의 원료비와 유통가격이 잇따라 조정되고 있다', '경쟁 품목의 가격표가 바뀌면서 소비자들의 비교 검색이 활발해졌다', '대체 가능한 제품군에서 가격 부담을 호소하는 반응이 늘고 있다'],
  complement_up: ['함께 사용하는 주변 제품의 가격이 오르면서 묶음 구매를 고민하는 소비자가 늘었다', '관련 액세서리와 서비스 요금이 조정돼 전체 이용비용이 커졌다는 평가다', '제품 이용에 필요한 부가 품목의 가격표가 잇따라 바뀌고 있다'],
  expect_price_up: ['원료 조달 상황을 두고 다음 달 가격표가 달라질 수 있다는 전망이 나오고 있다', '유통업계에서는 향후 가격 조정 가능성을 언급하는 목소리가 커졌다', '소비자들 사이에서 필요한 제품을 미리 준비하려는 움직임이 포착됐다'],
  expect_price_down: ['신제품 출시와 할인 행사 소식이 이어지며 구매 시기를 저울질하는 분위기다', '다음 달 판촉 경쟁이 예상되면서 소비자들이 가격표를 더 지켜보고 있다', '유통업체의 재고 할인 가능성이 거론되며 관망하는 소비자가 늘었다'],
  consumers_up: ['새 학기와 지역 행사 영향으로 상권을 찾는 인구가 크게 늘었다', '최근 지역 내 가구와 방문객 수가 증가했다는 통계가 발표됐다', '새로운 소비층이 유입되며 유통업계가 영업시간을 확대하고 있다'],
  consumers_down: ['계절적 이동과 일정 변화로 주요 상권의 유동인구가 줄었다', '최근 지역을 찾는 방문객 수가 이전보다 감소한 것으로 나타났다', '일부 소비층이 온라인이나 다른 지역 시장으로 이동하는 모습이다'],
  baseline: ['시장에서는 뚜렷한 변화 없이 평소와 비슷한 소비 흐름이 이어지고 있다'],
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
