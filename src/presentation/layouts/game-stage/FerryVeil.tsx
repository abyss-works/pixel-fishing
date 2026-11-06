import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FERRY_MOVE_AT_MS, ferryFrame } from '../../../game/runtime/ferryTransition';
import { useKeyBlocker } from '../../ui/hotkeys';

interface FerryVeilProps {
  /** 지금 항구에서 접안을 풀고 앞바다에 나온 모습으로 바꾼다 */
  onSurface: () => void;
  /** 완전 암전 동안 도착 자리로 옮긴다. 응답이 올 때까지 암전이 이어진다 */
  onMove: () => Promise<void>;
  onDone: () => void;
}

// 여객선 빠른 이동의 화면 덮개 — 검은 막의 농도를 그리고, 전환이 끝날 때까지 키와 포인터 입력을 막는다.
// 모션 줄이기 설정이면 덮개 없이 바로 옮긴다.
export default function FerryVeil(props: FerryVeilProps) {
  const [veil, setVeil] = useState(0);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  useKeyBlocker();

  useEffect(() => {
    let alive = true;
    let frame = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void latest.current.onMove().then(() => { if (alive) latest.current.onDone(); });
      return () => { alive = false; };
    }
    const start = performance.now();
    let settledAt: number | null = null;
    let moving = false;
    latest.current.onSurface();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (!moving && elapsed >= FERRY_MOVE_AT_MS) {
        moving = true;
        void latest.current.onMove().then(() => { settledAt = performance.now() - start; });
      }
      const f = ferryFrame(elapsed, settledAt);
      if (f.phase === 'done') { latest.current.onDone(); return; }
      setVeil(f.veil);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-(--z-app-modal) bg-black"
           style={{ opacity: veil }} />
      {createPortal(<div aria-hidden className="fixed inset-0 z-(--z-app-modal) touch-none" />, document.body)}
    </>
  );
}
