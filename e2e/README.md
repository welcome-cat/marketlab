# 브라우저 자동 검증

Playwright가 실제 Chromium 브라우저를 실행해 교사 로그인, 룸 생성, 학생 입장, 교사 화면의 실시간 반영을 검증합니다. 테스트용 룸과 회사는 고유한 `e2e-...` 이름을 사용하고 테스트 종료 시 삭제합니다.

```powershell
# 일반 실행(Chromium 1개 학생)
npm run test:e2e

# 브라우저 화면을 보며 실행
npm run test:e2e:headed

# Playwright 대화형 화면
npm run test:e2e:ui

# 최대 30명 동시 입장 검증
$env:E2E_STUDENT_COUNT=30
npm run test:e2e
Remove-Item Env:E2E_STUDENT_COUNT
```

기본적으로 Playwright가 `127.0.0.1:4173`에서 Vite 개발 서버를 자동으로 켭니다. 이미 실행 중인 서버나 배포 주소를 검사할 때는 다음처럼 지정할 수 있습니다.

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

테스트는 현재 `.env`에 연결된 Firebase 프로젝트를 사용하므로 네트워크 연결과 Firestore 접근 권한이 필요합니다. 실패 시 `playwright-report`와 `test-results`에 HTML 보고서, 스크린샷, 비디오, trace가 남습니다.
