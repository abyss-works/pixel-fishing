import { useEffect, useRef, useState } from 'react';
import {
  RARITY, SPOTS, JUDGMENT_MULT,
  addCatch, boatSpeed, canFishSpot, judgeTiming, rodStats, rollFish, worstFish,
} from './logic';
import type { Fish, GameState, Judgment } from './logic';
import {
  REGION_DEFS, CAST_RANGE,
  inTrigger, movePlayer, nearestSchoolInRange,
} from './world';
import type { Point, RegionId, School } from './world';
import { renderVillageField, renderOceanField, CANVAS_W, CANVAS_H } from './pixel';
import type { FishingPhase } from './pixel';

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const WALK_SPEED = 75;

const IDLE_STATUS: Record<RegionId, string> = {
  village: '이동: 방향키/WASD · 물가 군집 옆에서 스페이스=캐스팅 · 집 문=정비 · 포구=대양(배 필요)',
  ocean: '항해: 방향키/WASD · 군집 위에서 스페이스=캐스팅 · 항구=정비',
};

const STATUS: Record<Exclude<FishingPhase, 'idle'>, string> = {
  cast: '찌를 던지는 중... (그냥 두면 방치 낚시로 잡어가 잡힌다)',
  wait: '기다리는 중... "!"가 뜨면 스페이스! 노란 존=PERFECT',
  bite: '지금! 노란 존을 노려라! (놓아두면 잡어)',
  catch: '월척이다!',
};

interface Props {
  region: RegionId;
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  goBase: () => void;              // 집 문 / 항구 접안
  goTravel?: () => void;           // 마을 포구 → 대양
  /** 테스트용 시작 위치 */
  initialPos?: Point;
}

export default function Field({ region, game, setGame, setToast, goBase, goTravel, initialPos }: Props) {
  const def = REGION_DEFS[region];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 상태머신 (idle = 이동 중) — R6
  const [phase, setPhase] = useState<FishingPhase>('idle');
  const [fish, setFish] = useState<Fish | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  const posRef = useRef<Point>(initialPos ?? def.spawn);
  const keysRef = useRef(new Set<string>());
  const biteStartRef = useRef(0);
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

  // 핸들러 최신본 참조
  const actionRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const tryCastRef = useRef<(silent: boolean) => void>(() => {});
  const hookRef = useRef<(j: Judgment) => void>(() => {});

  // 단계별 자동 전환 타이머 (R6, R9) + 자동 모드 챔질
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
      case 'bite': // 게이지 종료까지 안 잡으면 방치(자동) 낚시 — 최하 어종 (R9)
        biteStartRef.current = Date.now();
        ms = st.sweep * 1000;
        next = 'catch';
        break;
      default: // catch → 같은 군집에 자동 재캐스트 (방치 루프)
        ms = 2000; next = 'cast';
        break;
    }
    const id = setTimeout(() => {
      if (phase === 'bite') { hookRef.current('auto'); return; }
      if (phase === 'catch') setFish(null);
      setPhase(next);
    }, ms);
    return () => clearTimeout(id);
  }, [phase, setToast]);

  // R7: 행동 버튼 하나 — idle이면 캐스팅, bite면 챔질(판정), 그 외 무시 (R10)
  const action = () => {
    const p = phaseRef.current;
    if (p === 'bite') {
      const st = rodStats(gameRef.current.rod);
      // oxlint-disable-next-line react/purity -- 이벤트 핸들러에서만 호출됨(렌더 아님)
      const pos = (Date.now() - biteStartRef.current) / 1000 / st.sweep;
      hookRef.current(judgeTiming(pos, st.zone));
      return;
    }
    if (p !== 'idle') return;
    tryCastRef.current(false);
  };

  // 캐스팅 시도 (silent=자동 루프용, 실패 토스트 생략)
  const tryCast = (silent: boolean) => {
    const pos = posRef.current;
    const s = nearestSchoolInRange(def.schools, pos.x, pos.y, CAST_RANGE);
    if (!s) { if (!silent) setToast('물고기 군집 가까이에서 던져야 한다.'); return; } // R5
    const spot = SPOTS.find(sp => sp.id === s.spot)!;
    if (!canFishSpot(gameRef.current, s.spot)) { // R5b: 배 게이트
      if (!silent) setToast(`${spot.name}에서 낚시하려면 배 ${spot.boatTier}단계가 필요하다. (조선소에서 구매)`);
      return;
    }
    setSchool(s);
    setPhase('cast');
    if (!silent) setToast(`${spot.name} 군집에 찌를 던졌다.`);
  };

  // R8: 획득 — perfect/normal은 판정 배수 추첨, auto(방치)는 최하 어종 고정
  const hookFish = (judgment: Judgment) => {
    const s = schoolRef.current;
    if (!s || phaseRef.current !== 'bite') return;
    const caught = judgment === 'auto'
      ? worstFish(s.spot)
      : rollFish(s.spot, JUDGMENT_MULT[judgment]); // R11
    const nextGame = addCatch(gameRef.current, caught);
    setGame(nextGame);
    setFish(caught);
    setPhase('catch');
    const r = RARITY[caught.rarity];
    const prefix = judgment === 'perfect' ? '✨ PERFECT! ' : judgment === 'auto' ? '⚙ 방치: ' : '';
    setToast(`${prefix}${r.name} 등급 [${caught.name}] 획득!`);
  };

  const cancelFishing = () => {
    setPhase('idle');
    setSchool(null);
    setFish(null);
  };

  useEffect(() => {
    actionRef.current = action;
    cancelRef.current = cancelFishing;
    tryCastRef.current = tryCast;
    hookRef.current = hookFish;
  });

  // 키보드: 이동 + 행동 (R4, R5c)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); actionRef.current(); return; }
      if (MOVE_KEYS[e.code]) {
        e.preventDefault();
        if (phaseRef.current !== 'idle') { // 이동 = 낚시 취소 (R5c)
          cancelRef.current();
          setToast('낚시를 접고 이동한다.');
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

  // 이동 + 트리거 + 렌더 루프 (jsdom에는 canvas/rAF 없음 → 건너뜀; 이동은 world.ts에서 단위 테스트)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || typeof requestAnimationFrame === 'undefined') return;
    const render = region === 'village' ? renderVillageField : renderOceanField;
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
        const speed = region === 'village' ? WALK_SPEED : boatSpeed(gameRef.current);
        posRef.current = movePlayer(def, posRef.current, Math.sign(dx), Math.sign(dy), dt, speed);
        if (inTrigger(posRef.current, def.baseTrigger)) { goBase(); return; } // R5c
        if (inTrigger(posRef.current, def.travelTrigger)) { // 마을 포구 → 대양
          if (gameRef.current.boat >= 1 && goTravel) { goTravel(); return; }
          posRef.current = { ...posRef.current, y: posRef.current.y - 8 }; // 되밀기
          setToast('대양에 나가려면 배가 필요하다. 집 목공소에서 조각배를 사자.');
        }
      }
      const st = rodStats(gameRef.current.rod);
      render(ctx, {
        player: posRef.current,
        phase: phaseRef.current,
        fish: fishRef.current,
        school: schoolRef.current,
        boat: gameRef.current.boat,
        biteT: phaseRef.current === 'bite'
          ? (Date.now() - biteStartRef.current) / 1000 / st.sweep : null,
        zone: st.zone,
        t: now / 1000,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [region, def, goBase, goTravel, setToast]);

  return (
    <>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game"
              aria-label={region === 'village' ? '마을' : '바다'}
              onClick={() => actionRef.current()} />
      <div className="status" data-phase={phase}>
        {phase === 'catch' && fish
          ? `${RARITY[fish.rarity].name} [${fish.name}] 획득!`
          : phase === 'idle' ? IDLE_STATUS[region] : STATUS[phase]}
      </div>
    </>
  );
}
