import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { FISH, RARITY, REJECT_TEXT, SPOTS, formName } from '../../../game/rules/logic';
import { boatGateText } from '../../../game/content/boats';
import type { GameState, Fish } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import { when } from '../../../shared/lib/when';
import { subscribeFailure } from '../../../core/errors';
import { useKeyScope } from '../../ui/hotkeys';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import { useSchools } from '../../../features/gameplay/service/schoolDay';
import { useFishArtStyle } from '../../../features/display/service/fishArtStyle';
import { alertEncounter } from '../../../features/bounty/service/encounterAlert';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import type { FieldCallbacks, FieldEvent } from '../../../game/runtime/fieldEngine';
import type { Point, RegionId, SceneRef } from '../../../game/world';
import { zoneById } from '../../../game/content/zones';
import { useCanvasCover } from './canvasCover';
import { GameFieldEngine } from '../../../game/runtime/fieldEngine';
import { CANVAS_W, CANVAS_H } from '../../../game/rendering/pixel/common.js';
import GameFrame from './GameFrame';
import NightOverlay from '../../ui/hud/NightOverlay';
import CatchCard from '../../ui/hud/CatchCard';
import type { Notify } from '../../ui/hud/messageFeed';

const STATUS = {
  wait: '입질을 기다리는 중이에요. “!”가 뜨면 스페이스를 눌러 주세요.\n빨간 영역은 PERFECT, 노란 영역은 GOOD이에요.',
  bite: '지금 눌러 주세요. 빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.',
  catch: '물고기를 끌어올리는 중이에요…',
} as const;

interface Props {
  region: RegionId;
  game: GameState;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onScene: (scene: SceneRef, message: string, entryPos?: Point) => void;
  onWarmup?: () => void;
  initialPos?: Point;
  /** 조우 창처럼 바다 위에 승부 창이 떠 있는 동안 — 켜지는 순간 낚시를 접는다(이동과 같은 취급) */
  paused?: boolean;
}

function presentEvent(event: FieldEvent, setToast: Props['setToast']): void {
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
        setToast(`${spot.name}에서 낚시하려면 배가 ${boatGateText(spot.boatTier)} 이상이어야 해요. 배는 집 목공소나 항구 조선소에서 살 수 있어요.`, 'warn');
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
      const prefix = event.judgment === 'perfect' ? 'PERFECT · '
        : event.judgment === 'good' ? 'GOOD · '
        : event.judgment === 'auto' ? '방치 · ' : '';
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
  region, game, dispatch, setToast, onScene, onWarmup, initialPos, paused,
}: Props) {
  // 현재 어군 — 세션의 배치 날짜가 정한다. 부트 결과로 날짜가 바뀌면 엔진에 교체해 준다.
  const schools = useSchools(region);
  const [engine] = useState(() => new GameFieldEngine(region, game, schools, initialPos));
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const covered = useCanvasCover();
  const { phase: dayPhaseNow } = useGameTime();
  const fish: Fish | null = snapshot.fishId
    ? FISH.find(candidate => candidate.id === snapshot.fishId) ?? null
    : null;
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    engine.attachCanvas(canvas);
  }, [engine]);

  useEffect(() => {
    const callbacks: FieldCallbacks = {
      dispatch: action => {
        return when(dispatch(action), result => result.status === 'ok'
          ? { status: 'ok', result: result.result }
          : result);
      },
      onEvent: event => presentEvent(event, setToast),
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

  useEffect(() => subscribeFailure(() => engine.cancelFishing()), [engine]);
  useEffect(() => { if (paused) engine.cancelFishing(); }, [engine, paused]);
  useEffect(() => () => engine.dispose(), [engine]);

  useKeyScope(event => engine.handleKeyDown(event.code, () => event.preventDefault()));

  return (
    <GameFrame>
      {covered ? (
        <div className="block w-full h-full bg-bg" aria-label="게임 화면(덮개)" />
      ) : (
        <canvas ref={attachCanvas} width={CANVAS_W} height={CANVAS_H}
                className="block w-full h-full [image-rendering:pixelated] cursor-pointer bg-bg
                           [filter:contrast(1.05)_saturate(1.07)_brightness(0.98)]"
                aria-label={region === 'village' ? '마을' : '바다'}
                onClick={() => engine.action()} />
      )}
      <NightOverlay />
      {snapshot.phase !== 'idle' && (
        <div data-phase={snapshot.phase}
           className="status-overlay absolute left-1/2 -translate-x-1/2 whitespace-pre-line
                      bottom-3 z-(--z-overlay)
                      max-w-[min(560px,calc(100%-24px))] px-3 py-1 rounded-full
                      text-sm text-center text-text bg-[rgba(6,12,24,0.55)] backdrop-blur-[4px]
                      text-shadow-hud pointer-events-none animate-overlay-in">
          {snapshot.phase === 'catch' && fish
            ? `${RARITY[fish.rarity].name} 등급 [${formName(fish, snapshot.catchInfo?.form ?? 'normal')}] 획득!`
            : STATUS[snapshot.phase]}
        </div>
      )}
      {snapshot.phase === 'catch' && fish && <CatchCard fish={fish} info={snapshot.catchInfo} />}
    </GameFrame>
  );
}
