import type { PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FISH, RARITY, REJECT_TEXT, SPOTS, formName } from '../../../game/rules/logic';
import { boatGateText, nextBoatText } from '../../../game/content/boats';
import type { GameState, Fish } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import { when } from '../../../shared/lib/when';
import { subscribeFailure } from '../../../core/errors';
import { useKeyScope } from '../../ui/hotkeys';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import { useSchools } from '../../../features/gameplay/service/schoolDay';
import { useFishArtStyle } from '../../../features/display/service/fishArtStyle';
import { alertEncounter } from '../../../features/bounty/service/encounterAlert';
import { liveFrame, useLivePosition } from '../../../features/live/service/useLive';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import type { FieldCallbacks, FieldEvent } from '../../../game/runtime/fieldEngine';
import { isTap, movePad, startPad } from '../../../game/runtime/movePad';
import type { Pad } from '../../../game/runtime/movePad';
import { REGION_PACKS } from '../../../game/world';
import type { Point, RegionId, SceneRef } from '../../../game/world';
import { zoneById } from '../../../game/content/zones';
import { useCanvasCover } from './canvasCover';
import { cx } from '../../ui/cx';
import { GameFieldEngine } from '../../../game/runtime/fieldEngine';
import { getSpotState } from '../../../game/world/currentSpot';
import { SCALE } from '../../../game/rendering/pixel/common.js';
import { FIELD_VIEW, mobileFieldView } from '../../../game/world/fieldView.js';
import GameFrame from './GameFrame';
import MovePad from './MovePad';
import { statusParts } from './statusText';
import { useMobileLayout } from '../useMobileLayout';
import NightOverlay from '../../ui/hud/NightOverlay';
import CatchCard from '../../ui/hud/CatchCard';
import HudPanel from '../../ui/hud/HudPanel';
import { HEADER_ROWS_OMIT_CLASS } from '../../ui/hud/headerTier';
import type { Notify } from '../../ui/hud/messageFeed';

interface Props {
  region: RegionId;
  game: GameState;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onScene: (scene: SceneRef, message: string, entryPos?: Point) => void;
  onWarmup?: () => void;
  initialPos?: Point;
  /** 장소 지정 순번 — 마운트 뒤에 바뀌면 같은 지역 안에서 플레이어를 initialPos(없으면 지역 출발점)로 옮긴다 */
  placeSeq?: number;
  /** 켜면 이동, 접안, 낚시 시작 같은 게임 조작이 멈춘다(여객선 전환 중). 화면 표시는 계속된다 */
  locked?: boolean;
  /** 조우 창처럼 바다 위에 승부 창이 떠 있는 동안 — 켜지는 순간 낚시를 접는다(이동과 같은 취급) */
  paused?: boolean;
  /** 모바일에서 낚시 상태 띠를 넣을 HUD 자리 — 없으면 프레임 아래 가운데에 둔다 */
  statusSlot?: HTMLElement | null;
}

function presentEvent(event: FieldEvent, setToast: Props['setToast'], boat: number): void {
  switch (event.type) {
    case 'cast': {
      const spot = SPOTS.find(candidate => candidate.id === event.spot)!;
      setToast(`${spot.name} 어군에 찌를 던졌어요.`);
      return;
    }
    case 'cast-denied':
      if (event.reason === 'range') {
        setToast('어군 가까이에서 찌를 던져 주세요.', 'warn');
      } else {
        const spot = SPOTS.find(candidate => candidate.id === event.spot)!;
        setToast(`${spot.name}에서 낚시하려면 배가 ${boatGateText(spot.boatTier)} 이상이어야 해요. ${nextBoatText(boat)}`, 'warn');
      }
      return;
    case 'line-cut':
      setToast('이 해역에서는 낚싯대 파워가 모자라요. 희귀한 물고기가 덜 걸리고 입질이 늦어져요. 작업대나 공방에서 낚싯대를 강화해 주세요.', 'warn');
      return;
    case 'movement-cancelled':
      setToast('낚시를 접고 이동해요.');
      return;
    case 'catch-rejected':
      setToast(REJECT_TEXT[event.reason], 'warn');
      return;
    case 'catch': {
      if (event.result.ticket) {
        setToast('흔적을 찾았어요. 화면 오른쪽 흔적 카드에서 추적을 눌러 보세요.');
        alertEncounter(event.result.ticket);
      }
      const caught = FISH.find(candidate => candidate.id === event.result.fishId)!;
      // 판정은 대괄호 꼬리표로 앞에 붙인다(화면 문구에 가운뎃점을 쓰지 않는다)
      const prefix = event.judgment === 'perfect' ? '[PERFECT] '
        : event.judgment === 'good' ? '[GOOD] '
        : event.judgment === 'auto' ? '[방치] ' : '';
      setToast(`${prefix}${RARITY[caught.rarity].name} 등급 [${formName(caught, event.result.info.form)}] 획득!`, 'gold');
      if (event.result.released.length > 0) {
        const names = event.result.released.map(released => released.name).join(', ');
        setToast(`가방이 가득 차 [${names}]을(를) 놓아줬어요. 명성은 그대로 남아요.`);
      }
      return;
    }
    case 'zone-blocked':
    case 'trigger-blocked':
      setToast(event.message, 'warn');
      return;
    case 'zone-entered':
      setToast(`${zoneById(event.zone)!.name}에 들어섰어요.`);
      return;
  }
}

export default function Field({
  region, game, dispatch, setToast, onScene, onWarmup, initialPos, placeSeq, locked, paused, statusSlot,
}: Props) {
  const mobile = useMobileLayout();
  // 현재 어군 — 세션의 배치 날짜가 정한다. 부트 결과로 날짜가 바뀌면 엔진에 교체해 준다.
  const schools = useSchools(region);
  const observer = useRef<ResizeObserver | null>(null);
  const [engine] = useState(() => new GameFieldEngine(region, game, schools, initialPos));
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  // 실시간 채널 — 내 위치를 보내고, 같은 바다의 다른 플레이어와 내 말풍선을 엔진이 프레임마다 그린다
  const readPosition = useCallback(() => {
    const pos = engine.getPosition();
    const bob = engine.getBobber();
    const resultAt = engine.getResultAt();
    return {
      region, zone: getSpotState().zone, x: Math.round(pos.x), y: Math.round(pos.y),
      line: engine.getSnapshot().phase !== 'idle', bob: bob ? { x: Math.round(bob.x), y: Math.round(bob.y) } : null,
      look: game.look, ...(resultAt === null ? {} : { idleMs: Date.now() - resultAt }),
    };
  }, [engine, region, game.look]);
  useLivePosition(readPosition);
  useEffect(() => {
    engine.setLiveSource(now => liveFrame(region, now));
    return () => engine.setLiveSource(null);
  }, [engine, region]);
  const covered = useCanvasCover();
  const { phase: dayPhaseNow } = useGameTime();
  const fish: Fish | null = snapshot.fishId
    ? FISH.find(candidate => candidate.id === snapshot.fishId) ?? null
    : null;
  // 모바일 시야 — 캔버스가 차지한 스테이지 크기에서 정한다. PC는 늘 PC 시야다
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const view = useMemo(
    () => mobile && stageSize ? mobileFieldView(stageSize.w, stageSize.h) : FIELD_VIEW, [mobile, stageSize]);
  useEffect(() => { engine.setView(view); }, [engine, view]);
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    engine.attachCanvas(canvas);
    observer.current?.disconnect();
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => {
      setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.current.observe(canvas);
  }, [engine]);

  useEffect(() => {
    const callbacks: FieldCallbacks = {
      dispatch: action => {
        return when(dispatch(action), result => result.status === 'ok'
          ? { status: 'ok', result: result.result }
          : result);
      },
      onEvent: event => presentEvent(event, setToast, game.boat),
      onScene,
      onWarmup,
    };
    engine.updateContext(game, dayPhaseNow === 'night', callbacks);
  }, [engine, game, dayPhaseNow, dispatch, setToast, onScene, onWarmup]);

  useEffect(() => { engine.setSchools(schools); }, [engine, schools]);

  const fishArtStyle = useFishArtStyle();
  useEffect(() => { engine.setFishArt(fishArtStyle); }, [engine, fishArtStyle]);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => engine.releaseKey(event.code);
    document.addEventListener('keyup', onKeyUp);
    return () => document.removeEventListener('keyup', onKeyUp);
  }, [engine]);

  const placedSeq = useRef(placeSeq);
  useEffect(() => {
    if (placedSeq.current === placeSeq) return;
    placedSeq.current = placeSeq;
    engine.placePlayer(initialPos ?? REGION_PACKS[region].spawn);
  }, [engine, placeSeq, initialPos, region]);
  useEffect(() => { engine.setControlLocked(locked === true); }, [engine, locked]);

  useEffect(() => subscribeFailure(() => engine.cancelFishing()), [engine]);
  useEffect(() => { if (paused) engine.cancelFishing(); }, [engine, paused]);
  useEffect(() => () => { observer.current?.disconnect(); engine.dispose(); }, [engine]);

  useKeyScope(event => engine.handleKeyDown(event.code, () => event.preventDefault()));

  // 모바일 스테이지 입력 — 누른 자리에서 10px를 넘게 끌면 원 패드로 이동, 그 안에서 떼면 짧게 누르기(클릭과 같은 상호작용)
  const [pad, setPad] = useState<Pad | null>(null);
  const gesture = useRef<{ id: number; pad: Pad } | null>(null);
  const pointAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onPadDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (locked || gesture.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, pad: startPad(pointAt(e)) };
  };
  const onPadMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (locked || !g || g.id !== e.pointerId) return;
    const next = movePad(g.pad, pointAt(e));
    if (next === g.pad) return;
    g.pad = next;
    engine.setMoveDirection(next.dir);
    setPad(next);
  };
  const onPadEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    engine.setMoveDirection(null);
    setPad(null);
    if (e.type === 'pointerup' && isTap(g.pad)) engine.action();
  };

  const inSlot = mobile && statusSlot != null;
  const status = snapshot.phase === 'idle' ? null : statusParts(snapshot.phase, mobile);
  const statusBand = status && (
    <HudPanel className={cx('z-(--z-stage-hud) px-3.5 py-1.5 whitespace-pre-line text-sm text-center text-text pointer-events-none animate-overlay-in',
      inSlot ? 'max-w-full' : 'absolute left-1/2 -translate-x-1/2 bottom-3 max-w-[min(480px,calc(100%-24px))]')}>
      {status.lead}
      {/* 판정 영역 설명 줄은 입력을 받지 않는 띠의 생략 글자라 툴팁 없이 숨기기만 한다 */}
      {status.judge && <span className={cx('block', HEADER_ROWS_OMIT_CLASS)}>{status.judge}</span>}
    </HudPanel>
  );

  return (
    <GameFrame>
      {covered ? (
        <div className="block w-full h-full bg-bg" aria-label="게임 화면(덮개)" />
      ) : (
        <canvas ref={attachCanvas} width={view.w * SCALE} height={view.h * SCALE}
                className="block w-full h-full [image-rendering:pixelated] cursor-pointer bg-bg
                           [filter:contrast(1.05)_saturate(1.07)_brightness(0.98)]"
                aria-label={region === 'village' ? '마을' : '바다'}
                onClick={mobile ? undefined : () => engine.action()}
                onPointerDown={mobile ? onPadDown : undefined} onPointerMove={mobile ? onPadMove : undefined}
                onPointerUp={mobile ? onPadEnd : undefined} onPointerCancel={mobile ? onPadEnd : undefined} />
      )}
      <NightOverlay />
      {pad?.active && !locked && <MovePad pad={pad} />}
      {/* 낚시 상태 — 게임 화면 아래 가운데의 반투명 노치 띠. 획득 순간에는 카드가 같은 내용을 보여 띠를 숨긴다 */}
      {snapshot.phase !== 'idle' && (
        <div data-phase={snapshot.phase} className="status-overlay contents">
          {snapshot.phase === 'catch' && fish ? (
            <CatchCard fish={fish} info={snapshot.catchInfo} />
          ) : (
            inSlot ? createPortal(statusBand, statusSlot) : statusBand
          )}
        </div>
      )}
    </GameFrame>
  );
}
