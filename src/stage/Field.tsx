import { useEffect, useRef, useState } from 'react';
import { FISH, RARITY, REJECT_TEXT, SPOTS, canFishSpot, formName, judgeTiming } from '../game/logic';
import type { CatchInfo, Fish, GameState, Judgment } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import { subscribeFailure } from '../errors';
import { useKeyScope } from '../hotkeys';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { REGION_PACKS, entryPoint, inTrigger, movePlayer, nearestSchoolInRange } from '../world';
import type { Point, RegionId, SceneRef, School } from '../world';
import { nextPhase, phaseDurationMs } from '../game/fishing';
import type { FishingPhase } from '../game/fishing';
import { moveSpeed, rodAxes, powerZones } from '../game/stats';
import { CAST_RANGE } from '../game/balance';
import { renderRegion, renderWorldMap, CANVAS_W, CANVAS_H } from '../pixel';
import GameFrame from './GameFrame';
import ResourceBar from './ResourceBar';
import CatchCard from './CatchCard';

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const STATUS: Record<Exclude<FishingPhase, 'idle'>, string> = {
  wait: '기다리는 중... "!"가 뜨면 스페이스! 빨간 존=SUPERB · 노란 존=PERFECT (그냥 둬도 잡힌다)',
  bite: '지금! 빨간 존을 노리면 SUPERB, 노란 존이면 PERFECT! (놓아두면 잡어)',
  catch: '끌어올리는 중...', // 서버 응답 대기 문구 — 결과 도착 후엔 획득 문구로 교체된다
};

interface Props {
  region: RegionId;
  game: GameState;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) — 캐치도 서버(또는 로컬 리듀서)가 계산 */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (msg: string) => void;
  /** 씬 전환 — 목적지·안내문은 트리거 데이터(팩)가 결정하고 Field는 전달만 한다.
   *  경계 봉합 travel은 입장 좌표(entryPoint)를 함께 넘긴다 — 스폰 텔레포트 대신 이어지는 위치. */
  onScene: (target: SceneRef, msg: string, entryPos?: Point) => void;
  onOpenMap?: () => void;          // 미니맵 클릭 — 지역 탭 열기 (미래: 월드맵 화면으로 승격 예정)
  onShop?: () => void;             // 필드 시설(목공소) 트리거 — 사이드바 패널 열기
  onWarmup?: () => void;           // 캐스팅 순간 서버 함수 워밍 (콜드 스타트 흡수)
  onOpenStats?: () => void;        // 자원 바 클릭 — 스탯창 모달 (App이 소유)
  /** 테스트용 시작 위치 */
  initialPos?: Point;
}

export default function Field({
  region, game, dispatch, setToast, onScene,
  onOpenMap, onShop, onWarmup, onOpenStats, initialPos,
}: Props) {
  const def = REGION_PACKS[region];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  // 상태머신 (idle = 이동 중) — R6
  const [phase, setPhase] = useState<FishingPhase>('idle');
  const [fish, setFish] = useState<Fish | null>(null);
  const [catchInfo, setCatchInfo] = useState<CatchInfo | null>(null); // 획득 카드 부가 정보 (크기/월척/변이/NEW)
  const [school, setSchool] = useState<School | null>(null);

  const posRef = useRef<Point>(initialPos ?? def.spawn);
  const keysRef = useRef(new Set<string>());
  const biteStartRef = useRef(0);
  const phaseRef = useRef(phase);
  const schoolRef = useRef(school);
  const gameRef = useRef(game);
  const openMapRef = useRef(onOpenMap);
  const shopRef = useRef(onShop);
  const toastRef = useRef(setToast);
  const dispatchRef = useRef(dispatch);
  const sceneRef = useRef(onScene);
  const warmupRef = useRef(onWarmup);
  useEffect(() => {
    phaseRef.current = phase;
    schoolRef.current = school;
    gameRef.current = game;
    openMapRef.current = onOpenMap;
    shopRef.current = onShop;
    toastRef.current = setToast;
    dispatchRef.current = dispatch;
    sceneRef.current = onScene;
    warmupRef.current = onWarmup;
  }, [phase, school, game, onOpenMap, onShop, setToast, dispatch, onScene, onWarmup]);

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
    // catch는 서버 결과(fish)가 도착해야 카운트다운 시작 — 응답이 늦으면 타이머가 먼저 끝나
    // 카드 없이 재캐스트되던 버그 방지. 응답 실패/타임아웃은 dispatch 쪽에서 cancel로 수렴.
    if (phase === 'catch' && !fish) return;
    if (phase === 'bite') biteStartRef.current = Date.now();
    let ms = phaseDurationMs(phase, gameRef.current.rod, undefined, fish?.rarity);
    // 파워 게이트 시간 트랙 — 미달 수역은 입질 대기가 부족 파워 5당 +1초 (stats.powerZones)
    if (phase === 'wait' && schoolRef.current) {
      ms += powerZones(gameRef.current, schoolRef.current.spot).biteExtra * 1000;
    }
    const id = setTimeout(() => {
      if (phase === 'bite') { hookRef.current('auto'); return; } // 방치 획득
      if (phase === 'catch') { setFish(null); setCatchInfo(null); }
      setPhase(nextPhase(phase));
    }, ms);
    return () => clearTimeout(id);
  }, [phase, fish]);

  // R7: 행동 버튼 하나 — idle이면 캐스팅, bite면 챔질(판정), 그 외 무시 (R10)
  const action = () => {
    const p = phaseRef.current;
    if (p === 'bite') {
      const s = schoolRef.current;
      if (!s) return;
      // oxlint-disable-next-line react/purity -- 이벤트 핸들러에서만 호출됨(렌더 아님)
      const pos = (Date.now() - biteStartRef.current) / 1000 / rodAxes(gameRef.current).sweep.value;
      // 존은 수역 파워 게이트에서 온다 — 미달 수역은 존 자체가 없다(서버도 강등한다).
      const z = powerZones(gameRef.current, s.spot);
      if (z.yellow === 0) {
        toastRef.current('바늘이 버틴다 — 이 바다는 더 강한 낚싯대를 원한다.');
      }
      hookRef.current(judgeTiming(pos, z.yellow / 100, z.red / 100));
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
    // 캐스팅 순간 서버 함수 워밍 — 콜드 스타트를 wait 구간(수 초)에 흡수해 챔질 응답을 빠르게.
    // 추첨과 무관한 빈 핑이라 보안 영향 없음.
    warmupRef.current?.();
    if (!silent) setToast(`${spot.name} 군집에 찌를 던졌다.`);
  };

  // R8: 획득 — 추첨·기록은 서버(리듀서)가 실행하고, 여기는 결과를 연출만 한다 (v0.5.0).
  // 판정(judgment)은 클라 주장 유지 — 타이밍 바 서버 동기화는 레이턴시 민감(확정 결정).
  const hookFish = (judgment: Judgment) => {
    const s = schoolRef.current;
    if (!s || phaseRef.current !== 'bite') return;
    // 즉시 catch 페이즈 진입 — 응답 대기 중 bite 타이머가 방치 획득을 중복 발사하지 못하게.
    // 물고기 공개는 응답 도착 시(카드) — HTTP 왕복은 획득 연출 시간에 흡수된다.
    setPhase('catch');
    when(dispatchRef.current({ type: 'catch', spot: s.spot, judgment }), r => {
      // 인프라 실패는 여기 오지 않는다 — 던져져서 정책으로 가고, 낚시 취소는 아래 구독이 한다
      if (r.status === 'rejected') {
        cancelRef.current();
        toastRef.current(REJECT_TEXT[r.error]);
        return;
      }
      const result = r.result;
      if (result.type !== 'catch') return; // 타입 좁히기 (catch 액션의 결과는 항상 catch)
      const caught = FISH.find(f => f.id === result.fishId)!;
      const info = result.info;
      setFish(caught);
      setCatchInfo(info);
      const prefix = judgment === 'superb' ? 'SUPERB! '
        : judgment === 'perfect' ? 'PERFECT! ' : judgment === 'auto' ? '방치: ' : '';
      // 로그는 최소 정보만 — 변이면 변이 이름이 곧 이름이다. 크기/월척/NEW는 획득 카드 소관.
      toastRef.current(
        `${prefix}${RARITY[caught.rarity].name} 등급 [${formName(caught, info.form)}] 획득!`);
      // 방생은 반드시 알린다 — 조용히 사라지면 유저는 개체를 잃은 걸로만 읽는다.
      // 명성이 남는다는 점을 같이 적어야 손실이 아니라 교환으로 읽힌다.
      if (result.released.length > 0) {
        const names = result.released.map(r => r.name).join(', ');
        toastRef.current(`가방이 가득 차 [${names}]을(를) 놓아줬다 — 명성은 남는다.`);
      }
    });
  };

  const cancelFishing = () => {
    setPhase('idle');
    setSchool(null);
    setFish(null);
    setCatchInfo(null);
  };

  // 실패하면 낚시를 취소한다 — 한 줄 규칙. 어떤 실패인지·무엇을 보여줄지는 정책이 안다.
  // (이게 없으면 catch 페이즈가 결과를 기다리며 영구 정지한다 — 홀드 설계의 짝)
  useEffect(() => subscribeFailure(() => cancelRef.current()), []);

  useEffect(() => {
    actionRef.current = action;
    cancelRef.current = cancelFishing;
    tryCastRef.current = tryCast;
    hookRef.current = hookFish;
  });

  // 키보드: 이동 + 행동 (R4, R5c) — 누른 키는 **스코프**를 통해 받는다.
  // 모달이 뜨면 스코프가 막아 주므로 여기서 모달 여부를 알 필요가 없다 (hotkeys.ts).
  useKeyScope(e => {
    if (e.code === 'Space') { e.preventDefault(); actionRef.current(); return true; }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      if (phaseRef.current !== 'idle') { // 이동 = 낚시 취소 (R5c)
        cancelRef.current();
        toastRef.current('낚시를 접고 이동한다.');
      }
      keysRef.current.add(e.code);
      return true;
    }
  });

  // keyup은 스코프를 태우지 않는다 — 키를 누른 채로 모달이 열리면 뗀 신호가 막혀
  // 캐릭터가 영원히 달린다. 떼는 신호는 언제나 통과시키는 게 안전한 쪽이다.
  useEffect(() => {
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    document.addEventListener('keyup', onUp);
    return () => document.removeEventListener('keyup', onUp);
  }, []);

  // 이동 + 트리거 + 렌더 루프 (jsdom에는 canvas/rAF 없음 → 건너뜀; 이동은 world 엔진에서 단위 테스트)
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
        const speed = moveSpeed(gameRef.current, def.movement).value;
        const prev = posRef.current;
        posRef.current = movePlayer(def, prev, Math.sign(dx), Math.sign(dy), dt, speed);
        // 트리거 — 목적지·게이트·안내문 전부 팩 데이터 (R5c). 새 지역/항로 = 데이터 행 추가.
        for (const trig of def.triggers) {
          if (!inTrigger(posRef.current, trig.rect)) continue;
          if (trig.action === 'base') {                                    // 거점 진입
            sceneRef.current({ kind: 'base', id: def.base }, trig.msg);
            return;
          }
          if (trig.action === 'travel') {                                  // 지역 간 이동 (배 게이트)
            if (gameRef.current.boat >= trig.requiredBoat) {
              // 경계 봉합 — 목적지의 마주 보는 자리에서 이어서 등장한다 (오픈월드 R5c)
              const entry = entryPoint(REGION_PACKS[trig.to], trig, posRef.current);
              sceneRef.current({ kind: 'region', id: trig.to }, trig.msg, entry);
              return;
            }
            posRef.current = prev;                                         // 되밀기 + 게이트 안내
            toastRef.current(trig.blockedMsg);
          } else if (trig.action === 'shop') {                             // 필드 시설 — 패널 열고 되밀기
            posRef.current = prev;
            shopRef.current?.();
          }
        }
      }
      const axes = rodAxes(gameRef.current);
      const cur = schoolRef.current;
      const pz = cur ? powerZones(gameRef.current, cur.spot) : null;
      renderRegion(ctx, def, {
        player: posRef.current,
        phase: phaseRef.current,
        school: cur,
        boat: gameRef.current.boat,
        biteT: phaseRef.current === 'bite'
          ? (Date.now() - biteStartRef.current) / 1000 / axes.sweep.value : null,
        // 유효 존 — 파워 게이트에서 온다(초과 보너스 포함, 미달이면 0/0)
        zone: pz ? pz.yellow / 100 : 0,
        red: pz ? pz.red / 100 : 0,
        t: now / 1000,
      });
      // 필드 위 미니맵 오버레이
      const mmCtx = minimapRef.current?.getContext('2d');
      if (mmCtx) {
        renderWorldMap(mmCtx, def, posRef.current, gameRef.current.boat, { t: now / 1000 });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [region, def]);

  return (
    <>
      <GameFrame>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                className="block w-full h-full [image-rendering:pixelated] cursor-pointer bg-bg
                           [filter:contrast(1.05)_saturate(1.07)_brightness(0.98)]"
                aria-label={region === 'village' ? '마을' : '바다'}
                onClick={() => actionRef.current()} />

        {/* 조작 안내는 지역 탭 하단으로 이동 — idle에는 상태 바를 띄우지 않는다 (자원 바 가림 방지).
            프레임 하단 중앙. 프레임이 positioned라 bottom-3이 그대로 프레임 기준이다.
            animate-overlay-in은 transform을 건드리지 않아 translate 중앙정렬과 충돌하지 않는다.
            .status-overlay 클래스는 스타일이 아니라 테스트 훅(app.test querySelector) — 유지 */}
        {phase !== 'idle' && (
          <div data-phase={phase}
             className="status-overlay absolute left-1/2 -translate-x-1/2
                        bottom-3 z-(--z-overlay)
                        max-w-[min(560px,calc(100%-24px))] px-3 py-1 rounded-full
                        text-sm text-center text-text bg-[rgba(6,12,24,0.55)] backdrop-blur-[4px]
                        [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] pointer-events-none animate-overlay-in">
            {phase === 'catch' && fish
              ? `${RARITY[fish.rarity].name} [${formName(fish, catchInfo?.form ?? 'normal')}] 획득!`
              : STATUS[phase]}
          </div>
        )}

        {/* 획득 카드 — 프레임 중앙 DOM 오버레이 (스프라이트/크기/월척/변이/NEW) */}
        {phase === 'catch' && fish && <CatchCard fish={fish} info={catchInfo} />}
      </GameFrame>

      {/* 아래 둘은 **스테이지 기준** — 프레임의 형제라 레터박스 여백까지 쓴다 */}
      <ResourceBar game={game} onOpen={onOpenStats} />

      {/* 미니맵 (스테이지 우하단) — % 폭도 스테이지 기준 */}
      <canvas ref={minimapRef} width={def.w} height={def.h}
              className="absolute right-3 bottom-3 z-(--z-overlay) w-[clamp(120px,25%,225px)] aspect-video
                         [image-rendering:pixelated] border border-line rounded-sm bg-bg shadow-panel cursor-pointer"
              aria-label="미니맵"
              onClick={() => onOpenMap?.()} />
    </>
  );
}
