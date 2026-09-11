import { expect, test, type Browser, type Page } from '@playwright/test';

const TEACHER_PASSWORD = process.env.E2E_TEACHER_PASSWORD || '13579246';
const requestedStudentCount = Number.parseInt(process.env.E2E_STUDENT_COUNT || '1', 10);
const studentCount = Number.isFinite(requestedStudentCount)
  ? Math.min(30, Math.max(1, requestedStudentCount))
  : 1;

async function loginTeacher(page: Page) {
  await page.goto('/teacher');
  const password = page.getByLabel('교사 비밀번호');
  if (await password.isVisible()) {
    await password.fill(TEACHER_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
  }
  await expect(page.getByRole('heading', { name: '교사용 대시보드' })).toBeVisible();
}

async function createRoom(page: Page, roomCode: string, title: string) {
  await page.getByRole('button', { name: '＋ 새 수업 룸 만들기' }).click();
  await page.getByPlaceholder('룸 코드 (예: 경제-3반)').fill(roomCode);
  await page.getByPlaceholder('수업 제목').fill(title);
  await page.getByRole('button', { name: '수업 룸 개설' }).click();
  await expect(page.getByText(`룸 코드 ${roomCode}`, { exact: true })).toBeVisible();
}

async function joinStudent(browser: Browser, baseURL: string, roomCode: string, index: number) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const companyName = `E2E기업-${index + 1}`;

  await page.goto('/');
  await page.getByPlaceholder('선생님이 안내한 코드 (예: ROOM101)').fill(roomCode);
  await page.getByPlaceholder('팀 또는 회사 이름 (예: 한빛전자)').fill(companyName);
  await page.getByLabel('학생 1 학번').fill(`E2E-${index + 1}`);
  await page.getByLabel('학생 1 이름').fill(`테스트학생${index + 1}`);
  await page.getByRole('button', { name: '회사 접속하기' }).click();

  await expect(page.getByRole('heading', { name: `🏢 ${companyName}` })).toBeVisible();
  await expect(page.getByText(new RegExp(`룸 ${roomCode}`))).toBeVisible();
  await expect(page.getByRole('button', { name: /카페 음료 시장/ })).toBeHidden();

  await page.getByRole('button', { name: '튜토리얼' }).click();
  await expect(page.locator('.student-market')).toBeVisible();
  await expect(page.locator('.student-investment')).toBeVisible();
  await expect(page.locator('.student-finance')).toBeVisible();
  await expect(page.locator('.student-sale')).toBeVisible();
  await expect(page.locator('.student-selling-progress')).toBeVisible();
  await page.locator('dialog.student-tour').getByRole('button', { name: '종료' }).click();
  await expect(page.locator('.student-market')).toHaveCount(0);
  await expect(page.locator('.student-investment')).toHaveCount(0);
  await expect(page.locator('.student-finance')).toHaveCount(0);
  await expect(page.locator('.student-selling-progress')).toHaveCount(0);

  await page.getByLabel(/농업 생산 경험/).check();
  await page.getByRole('button', { name: '기업 특성 확정' }).click();
  await expect(page.getByRole('button', { name: /쌀 시장/ })).toBeVisible();
  await page.locator('.student-diagnosis > summary').click();
  await expect(page.getByRole('button', { name: '모의 생산 비교 열기' })).toBeVisible();
  await expect(page.locator('.diagnosis-simulation')).toBeHidden();
  return { context, companyName };
}

test('교사 로그인 → 룸 생성 → 학생 입장', async ({ page, browser, baseURL }) => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const roomCode = `e2e-${suffix}`;
  const roomTitle = `E2E 자동검증 ${suffix}`;
  const studentContexts: Awaited<ReturnType<typeof joinStudent>>[] = [];
  let roomCreated = false;

  try {
    await loginTeacher(page);
    await createRoom(page, roomCode, roomTitle);
    roomCreated = true;

    const joins = Array.from({ length: studentCount }, (_, index) =>
      joinStudent(browser, baseURL!, roomCode, index),
    );
    studentContexts.push(...(await Promise.all(joins)));

    for (const { companyName } of studentContexts) {
      await expect(page.getByText(companyName, { exact: true })).toBeVisible();
    }
  } finally {
    await Promise.all(studentContexts.map(({ context }) => context.close()));

    if (roomCreated) {
      await page.goto('/teacher');
      const otherRooms = page.getByRole('button', { name: '다른 룸' });
      if (await otherRooms.isVisible()) await otherRooms.click();

      const roomCard = page.locator('.teacher-room-tile').filter({ hasText: `룸 코드 ${roomCode}` });
      if (await roomCard.isVisible()) {
        page.once('dialog', (dialog) => dialog.accept());
        await roomCard.getByRole('button', { name: '삭제' }).click();
        await expect(roomCard).toBeHidden();
      }
    }
  }
});
