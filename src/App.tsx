import { useEffect, useRef, useState } from 'react';
import { BASE_PACKS, HARBORS, LIVE_REGIONS, V_POND, V_SCHOOLS, resumePoint, schoolsOf } from './game/world';
import type { Point, SceneRef } from './game/world';
import type { BaseId, LocationRef } from './game/content/places';
import { spotById } from './game/content/spots';
import type { SpotId } from './game/content/spots';
import { boatGateText } from './game/content/boats';
import { topZoneOfSpot, zoneById } from './game/content/zones';
import { minLevelOfPower } from './game/rules/stats';
import { getSchoolDay } from './features/gameplay/service/schoolDay';
import { settleAction, useGame } from './features/gameplay/service/useGame';
import { useAccount } from './features/account/service/useAccount';
import { useLastPosition } from './features/gameplay/service/useLastPosition';
import { useMessageLog } from './presentation/layouts/hud/useMessageLog';
import { sendNotice } from './features/display/model/toastPolicy';
import { useDialogs } from './presentation/ui/useDialogs';
import GameView from './presentation/views/game/GameView';
import UpdateModal from './presentation/views/overlays/update/UpdateModal';
import SessionReplacedModal from './presentation/views/overlays/update/SessionReplacedModal';
import UnsavedModal from './presentation/views/overlays/update/UnsavedModal';
import LoadingOverlay from './presentation/views/overlays/update/LoadingOverlay';
import DevTools from './presentation/views/devtools/DevTools';
import EnvBadge from './presentation/views/devtools/EnvBadge';
import { DevEnvContext, devEnvOf } from './presentation/views/devtools/devEnv';
import { BUILD_LABEL, DEPLOY_ENV } from './buildId';
import { QueryProvider } from './core/QueryProvider';

// 장소 복원 규칙: 지금 열린 바다 지역이면 그 지역에서, 닫힌 지역이면 고향 항구에서 시작하고,
// 거점(집·항구)은 그대로 재개한다. 바다 지역 안의 좌표는 마지막 위치(resumePoint)가 정한다.
function sceneOf(location: LocationRef): SceneRef {
  if (location.kind === 'region' && !LIVE_REGIONS.includes(location.id)) return { kind: 'base', id: 'harbor' };
  return location;
}

/** 빌드 때 정해지는 값이라 모듈에서 한 번만 만든다 */
const DEV_ENV = devEnvOf(DEPLOY_ENV);

function AppContent() {
  const { log, setToast, toasts, dismissToast, setMirrorEnv } = useMessageLog([
    '집이에요. 가구를 눌러 정비하고, 문으로 나가 마을 물가에서 낚시해 보세요.',
  ]);
  const { game, dispatch, nickname, devTools, rename, sync, syncLabel, blocker, loading, guestProgress, recheckGuestProgress, adoptAccount, warmup, resync } = useGame({ setToast });
  useEffect(() => {
    setMirrorEnv({ blocked: blocker !== null, loading });
  }, [blocker, loading, setMirrorEnv]);
  const { input, dialogs } = useDialogs();
  const { account, accountChecked, accountFailed, uid, onAuthChanged } = useAccount({
    game, setToast, adoptAccount,
    askNewPassword: min => input({
      layer: 'app',
      title: '새 비밀번호', body: `새 비밀번호를 입력해 주세요.
${min}자 이상이어야 해요.`,
      label: '새 비밀번호', secret: true, confirmLabel: '바꾸기',
    }),
  });

  const [scene, setScene] = useState<SceneRef>(() => sceneOf(game.location));
  const [entryPos, setEntryPos] = useState<Point | null>(null);
  // 장소를 지정할 때마다 늘어나는 순번 — 같은 지역 안에서 같은 좌표로 다시 옮기는 경우도 Field가 알아챈다
  const [placeSeq, setPlaceSeq] = useState(0);
  // 접속 복원 — 저장된 장소로 옮기고, 바다면 마지막 위치를 읽은 뒤 그 자리에서 시작한다(갈 수 없는 자리면 출발점)
  const last = useLastPosition();
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || sync !== 'on' || !last.settled) return;
    restored.current = true;
    const next = sceneOf(game.location);
    setScene(next);
    setEntryPos(next.kind === 'region' ? resumePoint(next.id, last.position) : null);
  }, [sync, game.location, last.settled, last.position]);

  const place = (nextScene: SceneRef, position?: Point) => {
    setScene(nextScene);
    setEntryPos(position ?? null);
    setPlaceSeq(seq => seq + 1);
  };

  // 장소를 먼저 바꾸고 서버에 알린다. 거부나 실패가 오면 떠난 장소로 되돌린다.
  // 필드에서 떠났다면 returnPos(트리거에 닿기 직전의 자리)로, 아니면 그 장소의 진입 자리로 돌아온다
  const go = (nextScene: SceneRef, message: string, position?: Point, returnPos?: Point) => {
    const from = { scene, entryPos: returnPos ?? entryPos };
    const back = () => place(from.scene, from.entryPos ?? undefined);
    place(nextScene, position);
    sendNotice(setToast, { kind: 'travel.routineMove', text: message });
    void settleAction(() => dispatch({ type: 'travel', to: nextScene })).then(settled => {
      if (settled.ok) return;
      back();
      if (settled.notice) sendNotice(setToast, { kind: 'travel.blocked', text: settled.notice, cooldownKey: 'travel.blocked:go' });
    });
  };

  const teleportBase = async (base: BaseId): Promise<boolean> => {
    const from = { scene, entryPos };
    const nextScene: SceneRef = { kind: 'base', id: base };
    place(nextScene);
    const settled = await settleAction(() => dispatch({ type: 'travel', to: nextScene }));
    if (settled.ok) {
      sendNotice(setToast, { kind: 'travel.routineMove', text: `${BASE_PACKS[base].name}으로 순간이동했어요.` });
      return true;
    }
    place(from.scene, from.entryPos ?? undefined);
    if (settled.notice) sendNotice(setToast, { kind: 'travel.blocked', text: settled.notice, cooldownKey: 'travel.blocked:tp-base' });
    return false;
  };

  const teleportSpot = async (spotId: SpotId): Promise<boolean> => {
    const spot = spotById(spotId);
    if (!spot) return false;
    const zone = topZoneOfSpot(spotId);
    const reqBoat = Math.max(spot.boatTier, (zone && zoneById(zone)?.entryBoat) ?? 0);
    if (game.boat < reqBoat) {
      sendNotice(setToast, {
        kind: 'travel.blocked',
        text: `${spot.name} 해역에는 ${boatGateText(reqBoat)}이 필요해요.`,
        toastText: `${spot.name} 배 단계가 부족해요.`,
        cooldownKey: `travel.blocked:tp:${spotId}`,
      });
      return false;
    }
    const region = spotId === 'pond' || spotId === 'river' ? 'village' : 'world';
    let pos: Point;
    if (spotId === 'pond') {
      const s = V_SCHOOLS.find(v => v.spot === 'pond');
      pos = { x: s?.x ?? V_POND.x + 20, y: V_POND.y - 3 };
    } else if (spotId === 'river') {
      const s = V_SCHOOLS.find(v => v.spot === 'river');
      pos = { x: s?.x ?? 100, y: (s?.y ?? 222) - 26 };
    } else {
      const school = schoolsOf('world', getSchoolDay()).find(s => s.spot === spotId);
      pos = school ? { x: school.x, y: school.y } : HARBORS.harbor.departure;
    }
    const from = { scene, entryPos };
    const nextScene: SceneRef = { kind: 'region', id: region };
    place(nextScene, pos);
    const settled = await settleAction(() => dispatch({ type: 'travel', to: nextScene }));
    if (settled.ok) {
      const reqRod = minLevelOfPower(spot.powerReq ?? 0);
      const rodHint = game.rod < reqRod ? ` (권장 낚싯대 Lv.${reqRod})` : '';
      sendNotice(setToast, { kind: 'travel.routineMove', text: `${spot.name} 해역으로 순간이동했어요.${rodHint}` });
      return true;
    }
    place(from.scene, from.entryPos ?? undefined);
    if (settled.notice) sendNotice(setToast, { kind: 'travel.blocked', text: settled.notice, cooldownKey: 'travel.blocked:tp-spot' });
    return false;
  };

  // 게임 화면 위에 개발용 층 둘을 나란히 조합한다 — 환경 배지(운영 빌드면 없음)와
  // 개발 도구 패널(?admin + 로컬 또는 서버 판정이 참일 때만). 둘 다 게임 화면 바깥의 오버레이이고,
  // 이 빌드가 운영인지는 개발 환경 공급자 하나가 정한다(운영이면 패널은 대시보드 이동만 남는다).
  return (
    <>
      <GameView
        game={game} scene={scene} entryPos={entryPos} placeSeq={placeSeq}
        dispatch={dispatch} setToast={setToast} toasts={toasts} onDismissToast={dismissToast} onMirrorEnv={setMirrorEnv} onScene={go} onPlace={place} onWarmup={warmup}
        log={log} syncLabel={syncLabel} syncState={sync} guestProgress={guestProgress} recheckGuestProgress={recheckGuestProgress}
        account={account} accountChecked={accountChecked} accountFailed={accountFailed} uid={uid} nickname={nickname}
        onRename={rename} onAuthChanged={onAuthChanged} onResync={resync} blocker={blocker === 'update' ? <UpdateModal /> : blocker === 'replaced' ? <SessionReplacedModal /> : blocker === 'unsaved' ? <UnsavedModal /> : loading ? <LoadingOverlay /> : null}
        badge={<DevEnvContext.Provider value={DEV_ENV}><EnvBadge build={BUILD_LABEL} /></DevEnvContext.Provider>}
      />
      <DevEnvContext.Provider value={DEV_ENV}>
        <DevTools game={game} dispatch={dispatch} setToast={setToast} granted={devTools}
                  onTeleportBase={teleportBase} onTeleportSpot={teleportSpot} />
      </DevEnvContext.Provider>
      {dialogs}
    </>
  );
}

// 읽기 캐시는 셸 바깥에서 연다 — useGame(dispatch 무효화)·useBounty가 Provider 안에서 돈다.
export default function App() {
  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  );
}
