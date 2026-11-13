import { useEffect, useRef, useState } from 'react';
import { LIVE_REGIONS, resumePoint } from './game/world';
import type { Point, SceneRef } from './game/world';
import type { LocationRef } from './game/content/places';
import { settleAction, useGame } from './features/gameplay/service/useGame';
import { useAccount } from './features/account/service/useAccount';
import { useLastPosition } from './features/gameplay/service/useLastPosition';
import { useMessageLog } from './presentation/layouts/hud/useMessageLog';
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
  const { log, setToast } = useMessageLog([
    '집이에요. 가구를 눌러 정비하고, 문으로 나가 마을 물가에서 낚시해 보세요.',
  ]);
  const { game, dispatch, nickname, rename, sync, syncLabel, blocker, loading, guestProgress, recheckGuestProgress, adoptAccount, warmup, resync } = useGame({ setToast });
  const { input, dialogs } = useDialogs();
  const { account, accountChecked, accountFailed, uid, onAuthChanged } = useAccount({
    game, setToast, adoptAccount,
    askNewPassword: min => input({
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

  // 장소를 먼저 바꾸고 서버에 알린다. 거부나 실패가 오면 떠난 장소로 되돌린다
  const go = (nextScene: SceneRef, message: string, position?: Point) => {
    const from = { scene, entryPos };
    const back = () => place(from.scene, from.entryPos ?? undefined);
    place(nextScene, position);
    setToast(message);
    void settleAction(() => dispatch({ type: 'travel', to: nextScene })).then(settled => {
      if (settled.ok) return;
      back();
      if (settled.notice) setToast(settled.notice, 'warn');
    });
  };

  // 게임 화면 위에 개발용 층 둘을 나란히 조합한다 — 환경 배지(운영 빌드면 없음)와
  // 개발 도구 패널(?admin + 로컬·소유자만). 둘 다 게임 화면 바깥의 오버레이이고,
  // 이 빌드가 운영인지는 개발 환경 공급자 하나가 정한다(운영이면 패널은 대시보드 이동만 남는다).
  return (
    <>
      <GameView
        game={game} scene={scene} entryPos={entryPos} placeSeq={placeSeq}
        dispatch={dispatch} setToast={setToast} onScene={go} onPlace={place} onWarmup={warmup}
        log={log} syncLabel={syncLabel} syncState={sync} guestProgress={guestProgress} recheckGuestProgress={recheckGuestProgress}
        account={account} accountChecked={accountChecked} accountFailed={accountFailed} uid={uid} nickname={nickname}
        onRename={rename} onAuthChanged={onAuthChanged} onResync={resync} blocker={blocker === 'update' ? <UpdateModal /> : blocker === 'replaced' ? <SessionReplacedModal /> : blocker === 'unsaved' ? <UnsavedModal /> : loading ? <LoadingOverlay /> : null}
        badge={<DevEnvContext.Provider value={DEV_ENV}><EnvBadge build={BUILD_LABEL} /></DevEnvContext.Provider>}
      />
      <DevEnvContext.Provider value={DEV_ENV}>
        <DevTools game={game} dispatch={dispatch} setToast={setToast} account={account} />
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
