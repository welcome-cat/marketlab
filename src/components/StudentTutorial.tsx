import { useLayoutEffect, useRef, useState } from 'react';
import './StudentTutorial.css';

type Step = { target: string; title: string; body: string };
const production: Step[] = [
  { target: '.student-diagnosis > summary', title: '우리 기업 진단서', body: '업종 경험과 시장별 모의 결과를 비교하세요. 진단서의 계산은 실제 생산을 확정하지 않습니다.' },
  { target: '.student-market > div', title: '진출 시장 선택', body: '이전 거래가격과 재료비를 비교하세요. 시장 이동에는 기존 기계·재고 정산과 새 진입 비용이 생길 수 있습니다.' },
  { target: '.student-news > div article', title: '신문에서 단서 찾기', body: '소비자 리포트와 생산 동향을 나누어 읽으세요. 이전 거래가격은 이번 판매가격을 보장하지 않습니다.' },
  { target: '[data-tutorial="workers"]', title: '고용 노동자 수', body: '노동자를 늘리면 생산능력이 커지지만 추가 노동자의 한계생산물은 체감합니다. 확정 후에는 고용 계획을 바꿀 수 없습니다.' },
  { target: '.production-curve-column > div:first-child', title: '희망 공급량', body: '생산능력과 현금 한도 안에서 생산량을 정하세요. 더 많이 만든다고 반드시 모두 판매되는 것은 아닙니다.' },
  { target: '.curve-toggle-actions', title: '한계비용 곡선', body: '안내 종료 후 곡선보기 버튼으로 추가 생산 비용과 이전 거래가격을 비교하세요. 이전 가격은 판단의 참고값입니다.' },
  { target: '.student-investment > div', title: '기계와 업그레이드', body: '기계는 한계생산 체감을 완화하고 훈련은 기본 생산성을 높입니다. 해금 후 기계를 라운드당 최대 2대 구입할 수 있습니다.' },
  { target: '.student-cost > div:first-of-type', title: '비용 확인', body: '생산비와 투자비, 평균비용과 한계비용을 구분하세요. 투자에 지출한 현금 전부가 이번 라운드 비용은 아닙니다.' },
  { target: '.student-cost > div:nth-of-type(2)', title: '매출 / 이윤', body: '전량 판매를 가정한 예상치입니다. 실제 판매량과 가격에 따라 달라집니다. 이윤과 현금은 같은 뜻이 아닙니다.' },
  { target: '.student-cost > button', title: '생산 결정 확정', body: '고용·투자·생산량과 가격 방향 예측을 검토하세요. 안내 중에는 실행되지 않습니다. 이미 확정했다면 다음 라운드에 변경할 수 있습니다.' },
];
const selling: Step[] = [
  { target: '.student-selling-progress', title: '판매 진행', body: '시기별 판매 여부를 확인하세요. 판매 종료 후 거래가 정산됩니다.' },
  { target: '.student-sale', title: '희망가격과 판매 수량', body: '판매 중에는 −10원·−1원·+1원·+10원 버튼으로 허용 범위 안에서 가격을 조절합니다. 길게 누르면 반복됩니다. 최대 판매 희망 수량으로 남길 재고를 정합니다. 가격 변경이 판매를 보장하지는 않습니다.' },
];
const results: Step[] = [
  { target: '.student-result', title: '실제 거래 결과', body: '실제 판매량·매출·이윤·현금 변화를 확인하세요. 예상과 다른 이유를 가격과 비용, 미판매 재고에서 찾아보세요.' },
  { target: '.student-reflection-shell', title: '경제 활동지', body: '교사가 지정한 라운드에 활동지를 작성하세요. 이번 선택을 돌아보고 다음 라운드에서 바꿀 결정을 적어보세요.' },
];
export function StudentTutorial({ phase }: { phase: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const current = steps[index];
  useLayoutEffect(() => {
    if (!current) return;
    const target = document.querySelector<HTMLElement>(current.target);
    if (!target) return;
    // Leave room below the last tile for the explanation on short screens.
    const previousPadding = document.body.style.paddingBottom;
    document.body.style.paddingBottom = window.innerHeight + 'px';
    const details: Array<[HTMLDetailsElement, boolean]> = [];
    for (let node: HTMLElement | null = target; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) { details.push([node, node.open]); node.open = true; }
    }
    dialog.current?.showModal();
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
    panel.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    let frame = 0;
    const position = () => {
      if (!target.isConnected || !ring.current || !panel.current) return;
      const r = target.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight;
      const ph = panel.current.offsetHeight, pw = panel.current.offsetWidth;
      const left = Math.max(6, r.left - 4), top = Math.max(6, r.top - 4);
      const right = Math.min(w - 6, r.right + 4);
      const side = w - right > pw + 24, leftSide = left > pw + 24;
      const bottom = Math.min(r.bottom + 4, side || leftSide ? h - 6 : h - ph - 30);
      Object.assign(ring.current.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
      const x = side ? right + 12 : leftSide ? left - pw - 12 : Math.max(12, Math.min(left, w - pw - 12));
      const y = side || leftSide ? Math.max(12, Math.min(top, h - ph - 12)) : Math.min(h - ph - 12, Math.max(12, bottom + 12));
      Object.assign(panel.current.style, { left: x + 'px', top: y + 'px' });
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); document.body.style.paddingBottom = previousPadding; details.forEach(([node, open]) => { node.open = open; }); };
  }, [current]);
  const stop = () => { dialog.current?.close(); setSteps([]); setIndex(0); };
  const start = () => {
    const candidates = phase === 'SELLING' ? selling : phase === 'RESULT' ? results : production;
    const available = candidates.filter(step => document.querySelector(step.target));
    setSteps(available.length ? available : [{ target: '.student-round', title: '현재 라운드 안내', body: '교사의 다음 진행을 기다려주세요. 단계가 바뀌면 안내를 다시 열 수 있습니다.' }]);
    setIndex(0);
  };
  return <>
    <button type="button" className="tutorial-launch" onClick={start}>튜토리얼</button>
    <dialog ref={dialog} className="student-tour" aria-labelledby="tutorial-title" onCancel={stop}>
      <div ref={ring} className="tour-spotlight" aria-hidden="true" />
      <section ref={panel} className="tour-panel">
        <header><small>화면 안내 · {index + 1} / {steps.length}</small><button type="button" onClick={stop}>종료</button></header>
        <div aria-live="polite"><h2 id="tutorial-title" tabIndex={-1}>{current?.title}</h2><p>{current?.body}</p></div>
        <small>안내 중에는 화면의 선택이 변경되지 않습니다.</small>
        <footer><button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>이전</button><button type="button" className="tour-next" onClick={() => index === steps.length - 1 ? stop() : setIndex(value => value + 1)}>{index === steps.length - 1 ? '안내 마치기' : '다음'}</button></footer>
      </section>
    </dialog>
  </>;
}
