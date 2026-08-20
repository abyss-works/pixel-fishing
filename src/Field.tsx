import { useEffect, useRef, useState } from 'react';
import { RARITY, SPOTS, addCatch, boatSpeed, canFishSpot, rodStats } from './logic';
import type { Fish, GameState, Judgment } from './logic';
import { REGION_DEFS, inTrigger, movePlayer, nearestSchoolInRange } from './world';
import type { Point, RegionId, School } from './world';
import { nextPhase, phaseDurationMs, judgePress, resolveCatch } from './fishing';
import type { FishingPhase } from './fishing';
import { CAST_RANGE, WALK_SPEED } from './balance';
import { renderVillageField, renderOceanField, renderWorldMap, CANVAS_W, CANVAS_H } from './pixel';
import ResourceBar from './ResourceBar';

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const STATUS: Record<Exclude<FishingPhase, 'idle'>, string> = {
  wait: '기다리는 중... "!"가 뜨면 스페이스! 노란 존=PERFECT (그냥 둬도 잡힌다)',
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
  onOpenMap?: () => void;          // 미니맵 클릭 — 지역 탭 열기 (미래: 월드맵 화면으로 승격 예정)
  onShop?: () => void;             // 필드 시설(목공소) 트리거 — 사이드바 패널 열기
  /** 테스트용 시작 위치 */
  initialPos?: Point;
}

export default function Field({
  region, game, setGame, setToast, goBase, goTravel,
  onOpenMap, onShop, initialPos,
}: Props) {
  const def = REGION_DEFS[region];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  // 상태머신 (idle = 이동 중) — R6
  const [phase, setPhase] = useState<FishingPhase>('idle');
  const [fish, setFish] = useState<Fish | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  const posRef = useRef<Point>(initialPos ?? def.spawn);
  const keysRef = useRef(new Set<string>());
  const biteStartRef = useRef(0);
  const catchStartRef = useRef(0); // 획득 이펙트(버스트) 타이밍 기준
  const phaseRef = useRef(phase);
  const fishRef = useRef(fish);
  const schoolRef = useRef(school);
  const gameRef = useRef(game);
  const openMapRef = useRef(onOpenMap);
  const shopRef = useRef(onShop);
  const toastRef = useRef(setToast);
  useEffect(() => {
    phaseRef.current = phase;
    fishRef.current = fish;
    schoolRef.current = school;
    gameRef.current = game;
    openMapRef.current = onOpenMap;
    shopRef.current = onShop;
    toastRef.current = setToast;
  }, [phase, fish, school, game, onOpenMap, onShop, setToast]);

  // 핸들러 최신본 참조
  const actionRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const tryCastRef = useRef<(silent: boolean) => void>(() => {});
  const hookRef = useRef<(j: Judgment) => void>(() => {});

  // 단계별 자동 전환 타이머 — 규칙은 fishing.ts (R6, R9)
  // fish를 deps에 넣는 이유: catch 진입 시각(버스트 기준)과 지속시간(등급별 분기)이
  // "이번에 잡은 물고기"에 달려 있다 — phase만 보면 어떤 물고기인지 알 수 없다.
  useEffect(() => {
    if (phase === 'idle') return;
    if (phase === 'bite') biteStartRef.current = Date.now();
    if (phase === 'catch') catchStartRef.current = Date.now();
    const ms = phaseDurationMs(phase, gameRef.current.rod, undefined, fish?.rarity);
    const id = setTimeout(() => {
      if (phase === 'bite') { hookRef.current('auto'); return; } // 방치 획득
      if (phase === 'catch') setFish(null);
      setPhase(nextPhase(phase));
    }, ms);
    return () => clearTimeout(id);
  }, [phase, fish]);

  // R7: 행동 버튼 하나 — idle이면 캐스팅, bite면 챔질(판정), 그 외 무시 (R10)
  const action = () => {
    const p = phaseRef.current;
    if (p === 'bite') {
      // oxlint-disable-next-line react/purity -- 이벤트 핸들러에서만 호출됨(렌더 아님)
      hookRef.current(judgePress(Date.now() - biteStartRef.current, gameRef.current.rod));
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
    setPhase('wait'); // 캐스팅 연출 없이 바로 대기
    if (!silent) setToast(`${spot.name} 군집에 찌를 던졌다.`);
  };

  // R8: 획득 — 결정 규칙은 fishing.resolveCatch (R9, R11)
  const hookFish = (judgment: Judgment) => {
    const s = schoolRef.current;
    if (!s || phaseRef.current !== 'bite') return;
    const caught = resolveCatch(s.spot, judgment, gameRef.current.rod);
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
  // 콜백은 전부 ref로 읽는다 → 리스너를 마운트 시 한 번만 등록(리렌더 중 입력 유실 방지)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); actionRef.current(); return; }
      if (MOVE_KEYS[e.code]) {
        e.preventDefault();
        if (phaseRef.current !== 'idle') { // 이동 = 낚시 취소 (R5c)
          cancelRef.current();
          toastRef.current('낚시를 접고 이동한다.');
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
  }, []);

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
        const prev = posRef.current;
        posRef.current = movePlayer(def, prev, Math.sign(dx), Math.sign(dy), dt, speed);
        if (inTrigger(posRef.current, def.baseTrigger)) { goBase(); return; } // R5c
        if (inTrigger(posRef.current, def.travelTrigger)) { // 마을 포구 → 대양
          if (gameRef.current.boat >= 1 && goTravel) { goTravel(); return; }
          posRef.current = { ...posRef.current, y: posRef.current.y - 8 }; // 되밀기
          toastRef.current('대양에 나가려면 배가 필요하다. 포구 옆 목공소에서 조각배를 사자.');
        }
        if (inTrigger(posRef.current, def.shopTrigger)) { // 목공소 — 패널 열고 되밀기
          posRef.current = prev;
          shopRef.current?.();
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
        catchT: phaseRef.current === 'catch'
          ? (Date.now() - catchStartRef.current) / 1000 : null,
        zone: st.zone,
        t: now / 1000,
      });
      // 필드 위 미니맵 오버레이 (라벨 없는 월드맵 축소)
      const mmCtx = minimapRef.current?.getContext('2d');
      if (mmCtx) {
        renderWorldMap(mmCtx, region, posRef.current, gameRef.current.boat,
          { labels: false, t: now / 1000 });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [region, def, goBase, goTravel]);

  const title = region === 'village' ? `🌳 ${def.name}` : `🌊 ${def.name}`;

  return (
    <>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game"
              aria-label={region === 'village' ? '마을' : '바다'}
              onClick={() => actionRef.current()} />

      <ResourceBar title={title} game={game} />

      {/* 조작 안내는 지역 탭 하단으로 이동 — idle에는 상태 바를 띄우지 않는다 (자원 바 가림 방지) */}
      {phase !== 'idle' && (
        <div className="status-overlay" data-phase={phase}>
          {phase === 'catch' && fish
            ? `${RARITY[fish.rarity].name} [${fish.name}] 획득!`
            : STATUS[phase]}
        </div>
      )}

      <canvas ref={minimapRef} width={def.w} height={def.h}
              className="minimap-overlay" aria-label="미니맵"
              onClick={() => onOpenMap?.()} />
    </>
  );
}
