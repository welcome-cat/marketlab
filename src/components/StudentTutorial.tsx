import { useRef, useState } from 'react';
import './StudentTutorial.css';

const steps = [
  { title: '진단서로 우리 기업 알아보기', body: '업종 경험을 확인하고 모의 노동자 수와 생산량을 바꿔 시장별 결과를 비교하세요. 진단서의 모의 계산은 실제 고용이나 생산을 확정하지 않습니다.', hint: '같은 자본금에서 어떤 시장이 우리 기업에 유리할까요?' },
  { title: '진출할 시장 선택하기', body: '진단서 아래에서 시장을 선택하세요. 카페·쌀·운동화는 시장 거래가격을 받아들이며, 스마트폰은 기업별 가격과 경쟁 상황이 판매에 영향을 줍니다. 모든 시장은 매 라운드 판매합니다.', hint: '시장 이동에는 기존 기계·재고 정산과 새 진입 비용이 생길 수 있습니다.' },
  { title: '신문에서 가격 변화의 단서 찾기', body: '소비자 리포트와 생산 동향을 읽고 이전 라운드와 무엇이 달라졌는지 생각하세요. 화면에 공개된 이전 거래가격은 이번 라운드 판매가격을 보장하지 않습니다.', hint: '기사 속 소비자 행동과 생산 여건을 구분해서 읽어보세요.' },
  { title: '고용과 생산량 조절하기', body: '노동자를 늘리면 생산능력이 커지지만 추가 노동자의 한계생산물은 점점 줄어듭니다. 희망 공급량을 조절하고 한계비용 곡선을 확인하세요. 실제 생산은 생산능력과 보유 현금 안에서 가능합니다.', hint: '추가 1단위를 만들 때 드는 비용과 예상 판매가격을 비교해보세요.' },
  { title: '비용과 투자 검토 후 확정하기', body: '비용과 매출 / 이윤을 나누어 확인하세요. 예상매출은 전량 판매 가정입니다. 기계는 한계생산 체감을 완화하고, 노동자 훈련은 기본 생산성을 높입니다. 해금 후 기계는 한 라운드에 최대 2대 구입할 수 있습니다.', hint: '생산 결정 확정 전에 고용·투자·생산량과 가격 방향 예측을 다시 확인하세요. 확정 후 생산계획은 바꿀 수 없습니다.' },
  { title: '판매 상황을 보고 가격 조절하기', body: '판매가 시작되면 판매 진행 타일에서 거래 여부를 확인하세요. 희망가격은 −10원·−1원·+1원·+10원 버튼으로 조절하며 꾹 누르면 반복됩니다. 설정 가능한 가격 범위 안에서 변경됩니다.', hint: '최대 판매 희망 수량으로 남길 재고를 정하세요. 가격을 바꿔도 판매가 보장되지는 않습니다.' },
  { title: '결과를 비교하고 다음 라운드 준비하기', body: '거래 결과에서 실제 매출·이윤·현금 변화를 확인하세요. 이윤과 현금 잔액은 같은 뜻이 아닙니다. 교사가 지정한 라운드에는 퀴즈나 활동지를 확인하고 다음 선택을 돌아보세요.', hint: '이 안내는 언제든 상단의 튜토리얼 버튼으로 다시 볼 수 있습니다.' },
];

export function StudentTutorial() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const current = steps[step];
  return <>
    <button type="button" className="tutorial-launch" onClick={() => { setStep(0); dialog.current?.showModal(); }}>튜토리얼</button>
    <dialog ref={dialog} className="student-tutorial" aria-labelledby="tutorial-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="tutorial-content">
        <header><span>공급시뮬레이션 수업 · 학생 안내</span><button type="button" aria-label="튜토리얼 닫기" onClick={() => dialog.current?.close()}>닫기</button></header>
        <progress max={steps.length} value={step + 1} aria-label="튜토리얼 진행 단계" />
        <div aria-live="polite" aria-atomic="true"><small>{step + 1} / {steps.length}</small><h2 id="tutorial-title">{current.title}</h2><p>{current.body}</p><aside>{current.hint}</aside></div>
        <footer><button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>이전</button><button type="button" className="tutorial-next" onClick={() => step === steps.length - 1 ? dialog.current?.close() : setStep(value => value + 1)}>{step === steps.length - 1 ? '안내 마치기' : '다음'}</button></footer>
      </div>
    </dialog>
  </>;
}
