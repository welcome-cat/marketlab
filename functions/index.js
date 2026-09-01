import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const allowedFactors = new Set(['INCOME', 'PREFERENCE', 'RELATED_GOODS', 'EXPECTATION', 'CONSUMERS', 'BASELINE']);

const extractText = (response) => {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('');
};

const parseArticle = (text) => {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const article = JSON.parse(normalized);
  if (typeof article.headline !== 'string' || typeof article.body !== 'string') throw new Error('INVALID_ARTICLE');
  return { headline: article.headline.slice(0, 100), body: article.body.slice(0, 500) };
};

export const generateMarketNews = onRequest({
  region: 'asia-northeast3',
  cors: true,
  secrets: [openAiApiKey],
  timeoutSeconds: 30,
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const { marketName, factor, eventTitle, eventDescription } = request.body || {};
  if (typeof marketName !== 'string' || marketName.length > 40 || !allowedFactors.has(factor)
    || typeof eventTitle !== 'string' || eventTitle.length > 80
    || typeof eventDescription !== 'string' || eventDescription.length > 200) {
    response.status(400).json({ error: 'INVALID_INPUT' });
    return;
  }

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_NEWS_MODEL || 'gpt-5.4-nano',
        max_output_tokens: 350,
        instructions: `당신은 고등학교 경제 수업용 가상 신문의 기자입니다. 짧은 제목과 2~3문장의 한국어 기사를 작성하세요. 사건의 원인과 시장 분위기는 현실적인 정황으로 간접적으로 암시하되 정답을 직접 알려주지 마세요. '수요 증가', '수요 감소', '가격 상승', '가격 하락', 경제 요인 분류명, 변화율, 배수, 학생에게 하는 조언은 쓰지 마세요. 실제 기업·인물·기관을 사실처럼 인용하지 마세요. headline과 body만 있는 JSON 객체로 답하세요.`,
        input: `가상 시장: ${marketName}\n교사용 비공개 사건: ${eventTitle}\n비공개 설정 설명: ${eventDescription}\n비공개 요인 코드: ${factor}\n매번 표현과 상황을 다르게 구성하세요.`,
      }),
    });

    if (!aiResponse.ok) throw new Error(`OPENAI_${aiResponse.status}`);
    const data = await aiResponse.json();
    response.json(parseArticle(extractText(data)));
  } catch (error) {
    console.error('Market news generation failed', error);
    response.status(502).json({ error: 'NEWS_GENERATION_FAILED' });
  }
});
