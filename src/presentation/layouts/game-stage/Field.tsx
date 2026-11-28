import type { PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FISH, REJECT_TEXT, SPOTS } from '../../../game/rules/logic';
import { boatGateText, nextBoatText } from '../../../game/content/boats';
import type { GameState, Fish } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import { when } from '../../../shared/lib/when';
import { subscribeFailure } from '../../../core/errors';
import { useKeyScope } from '../../ui/hotkeys';
import { sendNotice } from '../../../features/display/model/toastPolicy';
import { fieldFxFrame, requestFx, useFxDirective } from '../../../features/display/service/fxPlayback';
import { eventFishSubjectById, eventSpotById } from '../../../features/events/model/events';
import { bagOverflowNoticeInput, classifyCatchNotice } from '../../../features/gameplay/model/catchNotice';
import {
  emitBiteSound,
  emitCastSound,
  emitCatchSound,
  emitHitSound,
  emitLineSnapSound,
} from '../../../features/sound/service/soundEvents';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import { reportCanvasFrame } from '../../../features/gameplay/service/clientMetrics';
import { useSchools } from '../../../features/gameplay/service/schoolDay';
import { useFishArtStyle } from '../../../features/display/service/fishArtStyle';
import { setPipFishingPhase } from '../../../features/pip/service/pipLiveStore';
import { alertEncounter } from '../../../features/bounty/service/encounterAlert';
import { effectiveLookForRegion } from '../../../features/live/model/live';
import { liveFrame, useLivePosition } from '../../../features/live/service/useLive';
import { serverIdleAvailable } from '../../../features/away/service/useAwayReport';
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
  onScene: (scene: SceneRef, message: string, entryPos?: Point, returnPos?: Point) => void;
  /** 이벤트 구역 도보 퇴장 트리거에 닿았을 때 알린다 */
  onLeaveEventZone?: () => void;
  /** 지금 계정이 게스트인가 — 게스트는 마을 밖으로 나가는 트리거에서 장소를 바꾸지 못하고 되밀린다 */
  guest?: boolean;
  /** 게스트가 마을 밖으로 나가려다 되밀렸을 때 */
  onGuestBlocked?: () => void;
  initialPos?: Point;
  /** 장소 지정 순번 — 마운트 뒤에 바뀌면 같은 지역 안에서 플레이어를 initialPos(없으면 지역 출발점)로 옮긴다 */
  placeSeq?: number;
  /** 켜면 이동, 접안, 낚시 시작 같은 게임 조작이 멈춘다(여객선 전환 중). 화면 표시는 계속된다 */
  locked?: boolean;
  /** 조우 창처럼 바다 위에 승부 창이 떠 있는 동안 — 켜지는 순간 낚시를 접는다(이동과 같은 취급) */
  paused?: boolean;
  /** 낚시 상태 띠를 넣을 HUD 자리 */
  statusSlot?: HTMLElement | null;
  /** 획득 카드를 넣을 HUD 자리 */
  catchSlot?: HTMLElement | null;
  uid?: string | null;
  /** 현재 저장 버전을 읽는다 — 모르면 null */
  saveVersion?: () => number | null;
}

function presentEvent(event: FieldEvent, setToast: Props['setToast'], game: GameState, region: RegionId): void {
  switch (event.type) {
    case 'cast': {
      const spot = SPOTS.find(candidate => candidate.id === event.spot) ?? eventSpotById(event.spot);
      const spotName = spot?.name ?? REGION_PACKS[region].info.shortName;
      sendNotice(setToast, {
        kind: 'catch.cast',
        text: `${spotName} 어군에 찌를 던졌어요.`,
      });
      return;
    }
    case 'cast-denied':
      if (event.reason === 'range') {
        sendNotice(setToast, {
          kind: 'catch.castDenied',
          text: '어군 가까이에서 찌를 던져 주세요.',
          toastText: '어군 가까이서 던져 주세요.',
          cooldownKey: 'cast-denied:range',
        });
      } else {
        const spot = SPOTS.find(candidate => candidate.id === event.spot) ?? eventSpotById(event.spot);
        if (!spot) return;
        sendNotice(setToast, {
          kind: 'catch.castDenied',
          text: `${spot.name}에서 낚시하려면 배가 ${boatGateText(spot.boatTier)} 이상이어야 해요. ${nextBoatText(game.boat)}`,
          toastText: `${spot.name} 배 단계가 부족해요.`,
          cooldownKey: `cast-denied:boat:${spot.id}`,
        });
      }
      return;
    case 'line-cut':
      sendNotice(setToast, {
        kind: 'catch.lineCut',
        text: '이 해역에서는 낚싯대 파워가 모자라요. 희귀한 물고기가 덜 걸리고 입질이 늦어져요. 작업대나 공방에서 낚싯대를 강화해 주세요.',
        toastText: '낚싯대 파워가 모자라요.',
        cooldownKey: `catch.lineCut:${getSpotState().zone ?? region}`,
      });
      return;
    case 'movement-cancelled':
      sendNotice(setToast, {
        kind: 'catch.movementCancelled',
        text: '낚시를 접고 이동해요.',
      });
      return;
    case 'catch-rejected':
      sendNotice(setToast, {
        kind: 'catch.rejected',
        text: REJECT_TEXT[event.reason],
      });
      return;
    case 'catch': {
      if (event.result.ticket) {
        sendNotice(setToast, {
          kind: 'catch.encounterTicket',
          text: '흔적을 찾았어요. 화면 오른쪽 흔적 카드에서 추적을 눌러 보세요.',
          toastText: '네임드 흔적을 발견했어요.',
          tone: 'named',
          logTone: 'info',
        });
        alertEncounter(event.result.ticket);
      }
      const caught = FISH.find(candidate => candidate.id === event.result.fishId)
        ?? eventFishSubjectById(event.result.fishId);
      if (caught) {
        const prevDexEntry = game.dex[caught.id]?.[event.result.info.form];
        const notice = classifyCatchNotice(caught, event.result.info, event.judgment, prevDexEntry, event.result.isPersonalBest);
        sendNotice(setToast, notice);
        if (event.result.eventDexCompleted?.length) {
          for (const kind of event.result.eventDexCompleted) {
            const label = kind === 'variant' ? '돌연변이 도감' : '도감';
            sendNotice(setToast, {
              kind: 'catch.legendaryOrFirstVariant',
              text: `강태공 분지 호수 ${label}을 완성했어요!`,
              toastText: `이벤트 ${label} 완성!`,
              tone: 'gold',
            });
          }
        }
        if (event.result.hatsGranted?.length) {
          sendNotice(setToast, {
            kind: 'catch.legendaryOrFirstVariant',
            text: '이벤트 도감 완성 보상으로 한정 모자를 받았어요! 집의 옷장에서 써 보세요.',
            toastText: '한정 모자 획득!',
            tone: 'gold',
          });
        }
        requestFx({
          kind: notice.kind,
          direct: event.manual,
          at: Date.now(),
          subject: {
            eventId: event.result.uid,
            region,
            fishId: caught.id,
            rarity: caught.rarity,
            form: event.result.info.form,
            isNew: event.result.info.isNew,
            from: event.jump.from,
            to: event.jump.to,
            holdEndsAt: event.holdEndsAt,
          },
        });
      }
      const overflow = bagOverflowNoticeInput(event.result);
      if (overflow) sendNotice(setToast, overflow);
      return;
    }
    case 'zone-blocked':
    case 'trigger-blocked':
      sendNotice(setToast, {
        kind: 'travel.blocked',
        text: event.message,
        cooldownKey: `travel.blocked:${event.type}`,
      });
      return;
    case 'zone-entered':
      sendNotice(setToast, {
        kind: 'travel.routineMove',
        text: `${zoneById(event.zone)!.name}에 들어섰어요.`,
      });
      return;
  }
}

export default function Field({
  region, game, dispatch, setToast, onScene, onLeaveEventZone, guest, onGuestBlocked, initialPos, placeSeq, locked, paused, statusSlot, catchSlot, uid, saveVersion,
}: Props) {
  const mobile = useMobileLayout();
  // 현재 어군 — 세션의 배치 날짜가 정한다. 부트 결과로 날짜가 바뀌면 엔진에 교체해 준다.
  const schools = useSchools(region);
  const observer = useRef<ResizeObserver | null>(null);
  const [engine] = useState(() => new GameFieldEngine(region, game, schools, initialPos));
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const cardFx = useFxDirective('catch-card');
  useEffect(() => {
    setPipFishingPhase(snapshot.phase);
  }, [snapshot.phase]);
  useEffect(() => () => {
    setPipFishingPhase('idle');
  }, []);
  // 실시간 채널 — 내 위치를 보내고, 같은 바다의 다른 플레이어와 내 말풍선을 엔진이 프레임마다 그린다
  const readPosition = useCallback(() => {
    const pos = engine.getPosition();
    const bob = engine.getBobber();
    const resultAt = engine.getResultAt();
    return {
      region, zone: getSpotState().zone, x: Math.round(pos.x), y: Math.round(pos.y),
      line: engine.getSnapshot().phase !== 'idle', bob: bob ? { x: Math.round(bob.x), y: Math.round(bob.y) } : null,
      look: effectiveLookForRegion(game.look, region), ...(resultAt === null ? {} : { idleMs: Date.now() - resultAt }),
    };
  }, [engine, region, game.look]);
  useLivePosition(readPosition);
  useEffect(() => {
    engine.setLiveSource(now => liveFrame(region, now));
    return () => engine.setLiveSource(null);
  }, [engine, region]);
  useEffect(() => {
    engine.setFxSource(wallMs => fieldFxFrame(region, wallMs));
    return () => engine.setFxSource(null);
  }, [engine, region]);
  const covered = useCanvasCover();
  const { phase: dayPhaseNow } = useGameTime();
  const manualCycleRef = useRef(false);
  const onLeaveEventZoneRef = useRef(onLeaveEventZone);
  useEffect(() => {
    onLeaveEventZoneRef.current = onLeaveEventZone;
  }, [onLeaveEventZone]);
  const fish: Fish | null = snapshot.fishId
    ? (FISH.find(candidate => candidate.id === snapshot.fishId)
      ?? eventFishSubjectById(snapshot.fishId)
      ?? null)
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
        if (action.type === 'catch' && action.judgment !== 'auto') {
          manualCycleRef.current = true;
          emitHitSound(action.judgment);
          if (action.judgment === 'perfect' || action.judgment === 'good') {
            requestFx({ kind: 'catch.judgment', direct: true, at: Date.now(), subject: { region, judgment: action.judgment } });
          }
        }
        return when(dispatch(action), result => result.status === 'ok'
          ? { status: 'ok', result: result.result }
          : result);
      },
      onEvent: event => {
        if (event.type === 'cast') {
          manualCycleRef.current = true;
          emitCastSound(true);
        } else if (event.type === 'bite') {
          emitBiteSound(manualCycleRef.current);
        } else if (event.type === 'line-cut') {
          emitLineSnapSound({ manual: manualCycleRef.current, underpowered: true });
        } else if (event.type === 'catch') {
          // 취소 뒤 새로 던진 사이클을 직전 방치 응답이 덮어쓰지 않도록 현재 잡기 단계일 때만 갱신한다
          if (engine.getSnapshot().phase === 'catch') {
            manualCycleRef.current = event.manual;
          }
          const caught = FISH.find(candidate => candidate.id === event.result.fishId)
            ?? eventFishSubjectById(event.result.fishId);
          emitCatchSound({
            manual: event.manual,
            rarity: event.rarity ?? caught?.rarity ?? 'common',
            isMutation: event.variant,
          });
        } else if (event.type === 'movement-cancelled' || event.type === 'catch-rejected') {
          manualCycleRef.current = false;
        }
        if (event.type === 'guest-blocked') onGuestBlocked?.();
        else presentEvent(event, setToast, game, region);
      },
      onScene,
      onLeaveEventZone: () => onLeaveEventZoneRef.current?.(),
      onIdleStart: spot => { if (serverIdleAvailable) void dispatch({ type: 'startIdle', spot }); },
      onIdleStop: () => { if (serverIdleAvailable) void dispatch({ type: 'stopIdle' }); },
      onFrame: reportCanvasFrame,
      guest,
      seedContext: () => {
        const version = saveVersion?.() ?? null;
        return uid && version !== null ? { uid, saveVersion: version } : null;
      },
    };
    engine.updateContext(game, dayPhaseNow === 'night', callbacks);
  }, [engine, region, game, dayPhaseNow, dispatch, setToast, onScene, guest, onGuestBlocked, uid, saveVersion]);

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

  useEffect(() => subscribeFailure(err => {
    if (err.kind === 'rate-limited') {
      if (err.context.action === 'catch') {
        engine.recoverFromRateLimit();
      }
      return;
    }
    engine.cancelFishing();
  }), [engine]);
  useEffect(() => { if (paused) engine.cancelFishing(); }, [engine, paused]);
  useEffect(() => () => { observer.current?.disconnect(); engine.dispose(); }, [engine]);

  const triggerManualAction = useCallback(() => {
    if (!locked && engine.getSnapshot().phase === 'bite') {
      manualCycleRef.current = true;
    }
    engine.action();
  }, [engine, locked]);

  useKeyScope(event => {
    if (!locked && event.code === 'Space' && engine.getSnapshot().phase === 'bite') {
      manualCycleRef.current = true;
    }
    return engine.handleKeyDown(event.code, () => event.preventDefault());
  });

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
    if (e.type === 'pointerup' && isTap(g.pad)) triggerManualAction();
  };

  const status = snapshot.phase === 'idle' ? null : statusParts(snapshot.phase, mobile);
  const statusBand = status && (
    <HudPanel className="z-(--z-stage-status) max-w-[min(480px,100%)] px-3.5 py-1.5 whitespace-pre-line text-sm text-center text-text pointer-events-none animate-overlay-in">
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
                aria-label={REGION_PACKS[region].info.shortName}
                onClick={mobile ? undefined : triggerManualAction}
                onPointerDown={mobile ? onPadDown : undefined} onPointerMove={mobile ? onPadMove : undefined}
                onPointerUp={mobile ? onPadEnd : undefined} onPointerCancel={mobile ? onPadEnd : undefined} />
      )}
      <NightOverlay />
      {pad?.active && !locked && <MovePad pad={pad} />}
      {/* 낚시 상태 — HUD 배치 컨테이너가 정한 슬롯에 반투명 노치 띠를 꽂는다. 획득 순간에는 카드 슬롯에 카드를 꽂고 띠를 숨긴다 */}
      {snapshot.phase !== 'idle' && (
        <div data-phase={snapshot.phase} className="status-overlay contents">
          {snapshot.phase === 'catch' && fish ? (
            catchSlot !== undefined
              ? (catchSlot != null ? createPortal(<CatchCard fish={fish} info={snapshot.catchInfo} fxIntensity={cardFx?.intensity ?? null} />, catchSlot) : null)
              : <CatchCard fish={fish} info={snapshot.catchInfo} fxIntensity={cardFx?.intensity ?? null} />
          ) : (
            statusSlot != null && statusBand ? createPortal(statusBand, statusSlot) : null
          )}
        </div>
      )}
    </GameFrame>
  );
}
