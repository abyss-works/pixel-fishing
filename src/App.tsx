import { useEffect, useRef, useState } from 'react';
import { LIVE_REGIONS } from './game/world';
import type { Point, SceneRef } from './game/world';
import type { LocationRef } from './game/content/places';
import { useGame } from './features/gameplay/service/useGame';
import { useAccount } from './features/account/service/useAccount';
import { useMessageLog } from './presentation/layouts/hud/useMessageLog';
import GameView from './presentation/views/game/GameView';
import DevTools from './presentation/views/devtools/DevTools';
import EnvBadge from './presentation/views/devtools/EnvBadge';
import { DevEnvContext, devEnvOf } from './presentation/views/devtools/devEnv';
import { BUILD_LABEL, DEPLOY_ENV } from './buildId';
import { QueryProvider } from './core/QueryProvider';

// 위치 복원 규칙: 바다 위치는 유지하지 않는다. 지역 씬이면 고향 항구에서 시작하고,
// 거점(집·항구)은 그대로 재개한다.
function sceneOf(location: LocationRef): SceneRef {
  if (location.kind === 'region' && !LIVE_REGIONS.includes(location.id)) return { kind: 'base', id: 'harbor' };
  return location;
}

/** 빌드 때 정해지는 값이라 모듈에서 한 번만 만든다 */
const DEV_ENV = devEnvOf(DEPLOY_ENV);

function AppContent() {
  const { log, setToast } = useMessageLog([
    '집이다. 가구를 클릭해 정비하고, 문으로 나가 마을 물가에서 낚시하자.',
  ]);
  const { game, setGame, dispatch, nickname, rename, sync, syncLabel, outdated, load, warmup } = useGame({ setToast });
  const { account, uid, onAuthChanged } = useAccount({ game, setGame, setToast, sync, load });

  const [scene, setScene] = useState<SceneRef>(() => sceneOf(game.location));
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || sync !== 'on') return;
    restored.current = true;
    setScene(sceneOf(game.location));
  }, [sync, game.location]);

  const [entryPos, setEntryPos] = useState<Point | null>(null);
  const go = (nextScene: SceneRef, message: string, position?: Point) => {
    setScene(nextScene);
    setEntryPos(position ?? null);
    setToast(message);
    dispatch({ type: 'travel', to: nextScene });
  };

  // 게임 화면 위에 개발용 층 둘을 나란히 조합한다 — 환경 배지(운영 빌드면 없음)와
  // 개발 도구 패널(?admin + 로컬·소유자만). 둘 다 게임 화면 바깥의 오버레이이고,
  // 이 빌드가 운영인지는 개발 환경 공급자 하나가 정한다(운영이면 패널은 대시보드 이동만 남는다).
  return (
    <>
      <GameView
        game={game} scene={scene} entryPos={entryPos}
        dispatch={dispatch} setToast={setToast} onScene={go} onWarmup={warmup}
        log={log} syncLabel={syncLabel} syncState={sync}
        account={account} uid={uid} nickname={nickname}
        onRename={rename} onAuthChanged={onAuthChanged} outdated={outdated}
      />
      <DevEnvContext.Provider value={DEV_ENV}>
        <EnvBadge build={BUILD_LABEL} />
        <DevTools game={game} dispatch={dispatch} setToast={setToast} account={account} uid={uid} />
      </DevEnvContext.Provider>
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
