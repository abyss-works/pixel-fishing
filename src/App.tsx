import { useEffect, useRef, useState } from 'react';
import { BASE_PACKS } from './world';
import type { FurnitureId, SceneRef } from './world';
import Base from './stage/Base';
import Field from './stage/Field';
import FacilityModal from './stage/FacilityModal';
import MessageLog from './stage/MessageLog';
import Sidebar from './sidebar';
import { DEFAULT_TAB } from './sidebar/tabs';
import type { TabKey } from './sidebar/tabs';
import type { ActionPanel } from './stage/FacilityModal';
import { useGame } from './hooks/useGame';
import { useAccount } from './hooks/useAccount';
import { useMessageLog } from './hooks/useMessageLog';
import Button from './ui/Button';

// 앱 셸 (계층: layout) — 씬 상태·탭·정비 패널과 화면 배치만 소유한다.
// 씬 그래프(어디서 어디로, 어떤 안내문으로)는 팩 데이터가 결정 — 새 지역/거점 추가에 App 무수정.
// 게임 상태/디스패치는 useGame(서버 권위 v0.5.0), 계정은 useAccount, 로그는 useMessageLog.

export default function App() {
  // 시스템 메시지 로그 — MMO 채팅창처럼 흘러가는 기록 (좌하단 오버레이)
  const { log, setToast } = useMessageLog([
    '집이다. 가구를 클릭해 정비하고, 문으로 나가 마을 물가에서 낚시하자.',
  ]);
  const { game, setGame, dispatch, sync, syncLabel, outdated, load, warmup } = useGame({ setToast });
  const { account, onAuthChanged } = useAccount({ game, setGame, setToast, sync, load });

  // 씬은 **세이브의 location에서 온다.** 순수 로컬 상태였을 때는 태평양에서 새로고침하면
  // 집으로 돌아갔다. 화면 상태는 여기서 즉시 바뀌고(연출은 기다리지 않는다) 저장은 액션이 한다.
  const [scene, setScene] = useState<SceneRef>(game.location);
  // 서버 로드는 비동기라 첫 렌더의 game은 기본 상태다 — 로드가 끝나면 저장된 위치로 **한 번**
  // 맞춘다. 이후에는 맞추지 않는다: 그러면 유저가 이동한 직후 서버 응답이 되돌려 버린다.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || sync !== 'on') return;
    restored.current = true;
    setScene(game.location);
  }, [sync, game.location]);
  // 우측 사이드바 상태 — 탭은 씬 무관 5개 고정, 씬이 바뀌면 열린 시설 패널만 닫는다
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);

  const go = (s: SceneRef, msg: string) => {
    setScene(s);
    setToast(msg);
    setActionPanel(null);
    // 서버에 위치를 남긴다 — 재개 지점이자 방문 기록(업적)의 근거.
    // 실패해도 화면은 이미 이동했다: 위치는 편의 정보라 이동을 막을 이유가 없다.
    dispatch({ type: 'travel', to: s });
  };
  // 씬 → 소속 지역 (지역 탭·도감이 거점에서도 현재 지역 정보를 알 수 있게) — 팩 데이터에서 파생
  const region = scene.kind === 'region' ? scene.id : BASE_PACKS[scene.id].region;

  // 미니맵 클릭 → 지역 탭 열기 (M 키 트리거는 폐지)
  // TODO: 월드맵 화면(지역 간 이동/전체 지구 조망)이 생기면 미니맵 클릭은 그쪽으로 연결한다.
  const onOpenMap = () => setActiveTab('region');

  // 거점 시설 클릭(캔버스) — 정비 시설은 스테이지 모달, 도감은 탭 전환, 문/여객선은 장면 이동.
  // 목적지·안내문은 거점 팩 데이터(region/exitMsg/travel) — 거점별 분기 없음.
  const onFacility = (id: FurnitureId) => {
    if (scene.kind !== 'base') return;
    const pack = BASE_PACKS[scene.id];
    switch (id) {
      case 'sell': case 'rod': case 'boat':
        setActionPanel(p => (p === id ? null : id));
        return;
      case 'dex':
        setActionPanel(null);
        setActiveTab('dex');
        return;
      case 'exit':
        go({ kind: 'region', id: pack.region }, pack.exitMsg);
        return;
      case 'travel':
        if (pack.travel) go({ kind: 'region', id: pack.travel.to }, pack.travel.msg);
        return;
    }
  };

  return (
    // 전체 화면 2패널 앱 셸: 좌 게임 스테이지 / 우 사이드바  — 페이지 스크롤 없음
    <div className="flex h-screen w-screen max-[820px]:flex-col">
      {/* 스테이지 — 스테이지 기준 오버레이(자원바/로그/미니맵)와 모달의 배치 기준(relative).
          프레임 기준 오버레이(낚시 안내·획득 카드)는 GameFrame 안에 있다.
          [--frame-h]: 게임 프레임 높이 공식 — GameFrame이 여기서 폭을 파생한다.
          최대 65vh, 스테이지(container-type: size)보다 크지 않게, 폭 기준 16:9도 넘지 않게. */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-bg flex items-center justify-center
                      [container-type:size] [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))]
                      max-[820px]:flex-[1_1_55%]">
        {/* 씬이 게임 프레임(GameFrame)을 직접 그리고, 스테이지 기준 오버레이를 그 형제로 낸다.
            App은 씬과 무관한 스테이지 오버레이(로그·정비 모달)만 여기 얹는다.
            key = 씬 전환 시 강제 리마운트 — 필드의 위치/상태머신 ref가 지역을 넘지 않게 */}
        {scene.kind === 'base' ? (
          <Base key={scene.id} base={scene.id} game={game} onFacility={onFacility} />
        ) : (
          <Field key={scene.id} region={scene.id} game={game} dispatch={dispatch} setToast={setToast}
                 onScene={go} onOpenMap={onOpenMap} onWarmup={warmup}
                 onShop={() => setActionPanel(p => (p === 'boat' ? p : 'boat'))} />
        )}

        {/* 시스템 메시지 로그 — 스테이지 좌하단 (미래 v0.9 실시간 채팅 자리) */}
        <MessageLog log={log} />

        {/* 정비 모달 — 판매/강화/배 (정비 중엔 이동하지 않으므로 게임 영역을 점유해도 자연스럽다) */}
        {actionPanel && (
          <FacilityModal panel={actionPanel} game={game} dispatch={dispatch}
                         setToast={setToast} onClose={() => setActionPanel(null)} />
        )}
      </div>

      <Sidebar
        region={region}
        activeTab={activeTab} setActiveTab={setActiveTab}
        game={game} dispatch={dispatch} setToast={setToast}
        syncLabel={syncLabel} syncState={sync}
        account={account} onAuthChanged={onAuthChanged}
      />

      {/* 업데이트 안내 — 배포 후 새로고침 안 한 탭 (서버 426). 닫기 없음, 새로고침이 유일한 출구 */}
      {outdated && <UpdateModal />}
    </div>
  );
}

// 낡은 탭 차단 모달 — 진행은 서버에 안전하니 위협 없는 톤으로 새로고침만 유도
function UpdateModal() {
  return (
    <div className="fixed inset-0 z-(--z-app-modal) bg-[rgba(4,9,18,0.8)] flex items-center justify-center animate-fade-in">
      <div className="pf-frame p-4 flex flex-col gap-2 w-[min(400px,calc(100%-32px))]">
        <h3 className="pf-accent text-lg text-gold">새 버전이 나왔어요</h3>
        <p className="text-sm leading-[1.7]">
          게임이 업데이트되어 이 화면은 더 진행할 수 없어요.
          지금까지의 진행은 서버에 안전하게 저장되어 있어요 —
          새로고침하면 바로 이어서 플레이할 수 있어요.
          (방금 마지막 행동 하나는 저장되지 않았을 수 있어요)
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>새로고침하고 이어하기</Button>
      </div>
    </div>
  );
}
