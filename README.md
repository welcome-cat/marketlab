# MarketLab 경제 수업 시뮬레이터

## 로컬 실행

```bash
npm install
npm run dev
```

기본 접속 주소는 `http://127.0.0.1:5173/`입니다.

## AI 시장 신문 활성화

AI 키는 브라우저의 `.env`에 넣지 않습니다. Firebase Functions의 비밀값으로만 저장합니다.

```bash
cd functions
npm install
cd ..
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions
```

배포 결과의 `generateMarketNews` URL을 프로젝트 루트 `.env`에 설정한 뒤 개발 서버를 다시 시작합니다.

```dotenv
VITE_NEWS_FUNCTION_URL=https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/generateMarketNews
```

함수 URL이 없거나 AI 호출이 실패하면 수업이 중단되지 않고 간접적인 자동 템플릿 기사가 발행됩니다.
