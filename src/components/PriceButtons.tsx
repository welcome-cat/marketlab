import { useEffect, useLayoutEffect, useRef } from 'react';

export function PriceButtons({ value, min, max, disabled, onChange }: {
  value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const latest = useRef({ value, min, max, disabled, onChange });
  useLayoutEffect(() => { latest.current = { value, min, max, disabled, onChange }; }, [value, min, max, disabled, onChange]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);
  const change = (delta: number) => {
    const current = latest.current;
    if (current.disabled) { stop(); return; }
    const next = Math.max(current.min, Math.min(current.max, current.value + delta));
    if (next !== current.value) { current.value = next; current.onChange(next); }
  };
  return <div className="sale-price-buttons">
    <span>판매 중 희망가격 조정</span>
    <strong>{value.toLocaleString()}원</strong>
    <div>{[-10, -1, 1, 10].map((delta) => <button key={delta} type="button"
      disabled={disabled || (delta < 0 ? value <= min : value >= max)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        stop(); change(delta);
        const repeat = () => { change(delta); if (!latest.current.disabled) timer.current = setTimeout(repeat, 120); };
        timer.current = setTimeout(repeat, 400);
      }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onClick={(event) => { if (event.detail === 0) change(delta); }}
    >{delta > 0 ? '+' : '−'}{Math.abs(delta)}원</button>)}</div>
    <small>누르거나 길게 눌러 조정 · 허용 범위 {min.toLocaleString()}~{max.toLocaleString()}원</small>
  </div>;
}
