import { useEffect, useRef, useState } from 'react';
import {
  RARITY, SPOTS, addCatch, levelForXp, rodStats, rollFish,
} from './logic';
import type { Fish, GameState } from './logic';
import {
  SPAWN, CAST_RANGE,
  atDock, movePlayer, nearestSchoolInRange,
} from './world';
import type { Point, School } from './world';
import { renderField, W, H } from './pixel';
import type { FishingPhase } from './pixel';

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const STATUS: Record<FishingPhase, string> = {
  idle: '항해: 방향키/WASD · 군집 위에서 스페이스(클릭)=캐스팅 · 선착장=귀항',
  cast: '찌를 던지는 중...',
  wait: '기다리는 중... "!"가 뜨면 스페이스(클릭)!',
  bite: '입질이 왔다! 지금!',
  catch: '월척이다!',
};

interface Props {
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  goHome: () => void;
  /** 테스트용 시작 위치 (기본: 집 문 앞) */
  initialPos?: Point;
}

export default function Field({ game, setGame, setToast, goHome, initialPos }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // R6 상태머신 (idle = 이동 중)
  const [phase, setPhase] = useState<FishingPhase>('idle');
  const [fish, setFish] = useState<Fish | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  const posRef = useRef<Point>(initialPos ?? SPAWN);
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef(phase);
  const fishRef = useRef(fish);
  const schoolRef = useRef(school);
  const gameRef = useRef(game);
  useEffect(() => {
    phaseRef.current = phase;
    fishRef.current = fish;
    schoolRef.current = school;
    gameRef.current = game;
  }, [phase, fish, school, game]);

  // 단계별 자동 전환 타이머 (R6, R9)
  useEffect(() => {
    if (phase === 'idle') return;
    const st = rodStats(gameRef.current.rod);
    let ms: number, next: FishingPhase;
    switch (phase) {
      case 'cast':
        ms = 600; next = 'wait';
        break;
      case 'wait':
        ms = (st.biteMin + Math.random() * (st.biteMax - st.biteMin)) * 1000;
        next = 'bite';
        break;
      case 'bite': // 놓침 — 페널티 없이 재대기 (R9)
        ms = st.window * 1000;
        next = 'wait';
        break;
      default: // catch → 같은 군집에 자동 재캐스트
        ms = 2000; next = 'cast';
        break;
    }
    const id = setTimeout(() => {
      if (phase === 'bite') setToast('앗, 놓쳤다! 괜찮아, 곧 또 입질이 온다.');
      if (phase === 'catch') setFish(null);
      setPhase(next);
    }, ms);
    return () => clearTimeout(id);
  }, [phase, setToast]);

  // R7: 행동 버튼 하나 — idle이면 캐스팅, bite면 챔질, 그 외 무시 (R10)
  const action = () => {
    const p = phaseRef.current;
    if (p === 'bite') { hookFish(); return; }
    if (p !== 'idle') return;
    const pos = posRef.current;
    const s = nearestSchoolInRange(pos.x, pos.y, CAST_RANGE);
    if (!s) { setToast('물고기 군집 위로 배를 몰고 가서 던지자.'); return; } // R5
    const spot = SPOTS.find(sp => sp.id === s.spot)!;
    const level = levelForXp(gameRef.current.xp).level;
    if (level < spot.unlockLevel) { // R5b
      setToast(`${spot.name} 어종은 Lv.${spot.unlockLevel}부터 낚을 수 있다. (현재 Lv.${level})`);
      return;
    }
    setSchool(s);
    setPhase('cast');
    setToast(`${spot.name} 군집에 찌를 던졌다. "!"가 뜨면 스페이스!`);
  };

  // R8: 획득
  const hookFish = () => {
    const s = schoolRef.current;
    if (!s) return;
    const g = gameRef.current;
    const st = rodStats(g.rod);
    const before = levelForXp(g.xp).level;
    const caught = rollFish(s.spot, st.luck); // R11
    const nextGame = addCatch(g, caught);
    setGame(nextGame);
    setFish(caught);
    setPhase('catch');
    const r = RARITY[caught.rarity];
    let msg = `${r.name} 등급 [${caught.name}] 획득! (+${r.xp}xp)`;
    const after = levelForXp(nextGame.xp).level;
    if (after > before) {
      msg += ` ✨ 레벨 업! Lv.${after}`;
      const unlocked = SPOTS.find(sp => sp.unlockLevel === after);
      if (unlocked) msg += ` — [${unlocked.name}] 수역 해금!`;
    }
    setToast(msg);
  };

  const cancelFishing = () => {
    setPhase('idle');
    setSchool(null);
    setFish(null);
  };

  const actionRef = useRef(action);
  const cancelRef = useRef(cancelFishing);
  useEffect(() => {
    actionRef.current = action;
    cancelRef.current = cancelFishing;
  });

  // 키보드: 이동 + 행동 (R4, R5c)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); actionRef.current(); return; }
      if (MOVE_KEYS[e.code]) {
        e.preventDefault();
        if (phaseRef.current !== 'idle') { // 이동 = 낚시 취소 (R5c)
          cancelRef.current();
          setToast('낚시를 접고 다시 항해한다.');
        }
        keysRef.current.add(e.code);
      }
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
    };
  }, [setToast]);

  // 이동 + 렌더 루프 (jsdom에는 canvas/rAF 없음 → 건너뜀; 이동 로직은 world.ts에서 단위 테스트)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let dx = 0, dy = 0;
      for (const k of keysRef.current) {
        const d = MOVE_KEYS[k];
        if (d) { dx += d[0]; dy += d[1]; }
      }
      if ((dx || dy) && phaseRef.current === 'idle') {
        posRef.current = movePlayer(posRef.current, Math.sign(dx), Math.sign(dy), dt);
        if (atDock(posRef.current)) { goHome(); return; } // R5c: 선착장 → 집
      }
      renderField(ctx, {
        player: posRef.current,
        phase: phaseRef.current,
        fish: fishRef.current,
        school: schoolRef.current,
        level: levelForXp(gameRef.current.xp).level,
        t: now / 1000,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [goHome]);

  return (
    <>
      <canvas ref={canvasRef} width={W} height={H} className="game"
              aria-label="바다" onClick={() => actionRef.current()} />
      <div className="status" data-phase={phase}>
        {phase === 'catch' && fish
          ? `${RARITY[fish.rarity].name} [${fish.name}] 획득!`
          : STATUS[phase]}
      </div>
    </>
  );
}
