import { useEffect, useRef, useState } from 'react';
import { FERRY_MOVE_AT_MS, ferryFrame } from '../../../game/runtime/ferryTransition';

interface FerryVeilProps {
  /** 지금 항구에서 접안을 풀고 앞바다에 나온 모습으로 바꾼다 */
  onSurface: () => void;
  /** 완전 암전 동안 도착 자리로 옮긴다. 응답이 올 때까지 암전이 이어진다 */
  onMove: () => Promise<void>;
  onDone: () => void;
}

// 여객선 빠른 이동의 화면 덮개 — 검은 막의 농도만 그린다. 키와 포인터 입력은 막지 않으며 게임 조작은 필드 엔진의 잠금이 멈춘다.
// 모션 줄이기 설정이면 덮개 없이 바로 옮긴다.
export default function FerryVeil(props: FerryVeilProps) {
  const [veil, setVeil] = useState(0);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

  // 이동 한 번의 진행 상태는 인스턴스에 두어, 효과가 다시 실행돼도 onSurface, onMove, onDone이 각각 한 번만 불린다.
  const trip = useRef({ started: false, start: 0, moving: false, settledAt: null as number | null, done: false });
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const t = trip.current;
    let frame = 0;
    const finish = () => {
      if (t.done || !mounted.current) return;
      t.done = true;
      latest.current.onDone();
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!t.started) {
      t.started = true;
      t.start = performance.now();
      if (reduced) {
        t.moving = true;
        void latest.current.onMove().then(finish);
      } else {
        latest.current.onSurface();
      }
    }
    if (!reduced) {
      const tick = () => {
        const elapsed = performance.now() - t.start;
        if (!t.moving && elapsed >= FERRY_MOVE_AT_MS) {
          t.moving = true;
          void latest.current.onMove().then(() => { t.settledAt = performance.now() - t.start; });
        }
        const f = ferryFrame(elapsed, t.settledAt);
        if (f.phase === 'done') { finish(); return; }
        setVeil(f.veil);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => { mounted.current = false; cancelAnimationFrame(frame); };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-(--z-app-modal) bg-black"
         style={{ opacity: veil }} />
  );
}
