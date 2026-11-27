import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EVENT_ZONE_MOVE_AT_MS, eventZoneVeilFrame } from '../../../game/runtime/eventZoneTransition';
import { HOTKEY_TIER, useKeyScope } from '../../ui/hotkeys';
import { useWindowHost } from '../../ui/windowLayer';

export interface EventZoneVeilProps {
  mode: 'enter' | 'leave';
  /** 완전 암전 동안 구역 전환 액션을 실행한다. 응답이 올 때까지 암전이 이어진다 */
  onMove: () => Promise<void>;
  onDone: () => void;
}

const SNOWFLAKES = Array.from({ length: 24 }, (_, i) => ({
  x: (i * 37 + 11) % 96 + 2,
  y: (i * 53 + 7) % 100,
  size: i % 4 === 0 ? 3 : 2,
  speed: 0.012 + (i % 5) * 0.004,
  alpha: 0.25 + (i % 4) * 0.14,
}));

// 이벤트 구역(강태공 분지 호수) 입·퇴장 전환 덮개 — 깊은 겨울 남청(#071122) 암전과 은은한 픽셀 눈발, 중앙 안내 자막을 그린다.
// 창 층 자리에 fixed로 띄워 스테이지와 탭 줄·사이드바를 함께 덮고, 전환 중 Esc만 차단한다.
export default function EventZoneVeil(props: EventZoneVeilProps) {
  useKeyScope(e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    return true;
  }, { tier: HOTKEY_TIER.BLOCKER });

  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [frameState, setFrameState] = useState({ veil: 0, elapsed: 0 });
  const windowHost = useWindowHost();
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

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
    if (!t.started) {
      t.started = true;
      t.start = performance.now();
      if (reduced) {
        t.moving = true;
        void latest.current.onMove().then(finish);
      }
    }
    if (!reduced) {
      const tick = () => {
        const elapsed = performance.now() - t.start;
        if (!t.moving && elapsed >= EVENT_ZONE_MOVE_AT_MS) {
          t.moving = true;
          void latest.current.onMove().then(() => { t.settledAt = performance.now() - t.start; });
        }
        const f = eventZoneVeilFrame(elapsed, t.settledAt);
        if (f.phase === 'done') { finish(); return; }
        setFrameState({ veil: f.veil, elapsed });
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => { mounted.current = false; cancelAnimationFrame(frame); };
  }, [reduced]);

  if (reduced) return null;

  const caption = props.mode === 'enter'
    ? '강태공 분지 호수로 이동하고 있어요.'
    : '원래 있던 곳으로 돌아가고 있어요.';

  const cover = (
    <div
      aria-hidden="true"
      data-event-zone-veil="true"
      className="pointer-events-none fixed inset-0 z-(--z-veil) flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#071122', opacity: frameState.veil }}
    >
      {SNOWFLAKES.map((flake, i) => (
        <span
          key={i}
          data-snowflake="true"
          className="absolute bg-white"
          style={{
            left: `${flake.x}%`,
            top: `${(flake.y + frameState.elapsed * flake.speed) % 100}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.alpha,
          }}
        />
      ))}
      <span className="relative px-4 text-center text-sm font-bold tracking-wide text-text text-shadow-hud">
        {caption}
      </span>
    </div>
  );

  return windowHost ? createPortal(cover, windowHost) : cover;
}
