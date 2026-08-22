import { useState } from 'react';
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

  const [scene, setScene] = useState<SceneRef>({ kind: 'base', id: 'home' });
  // 우측 사이드바 상태 — 탭은 씬 무관 5개 고정, 씬이 바뀌면 열린 시설 패널만 닫는다
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);

  const go = (s: SceneRef, msg: string) => { setScene(s); setToast(msg); setActionPanel(null); };
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
      {/* 스테이지 — 정보 오버레이(자원바/로그/미니맵)와 모달의 배치 기준(relative).
          [--frame-h]: 게임 프레임 높이 공식 — 프레임과 상태 오버레이가 공유하는 단일 정의.
          최대 65vh, 스테이지(container-type: size)보다 크지 않게, 폭 기준 16:9도 넘지 않게. */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-bg flex items-center justify-center
                      [container-type:size] [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))]
                      max-[820px]:flex-[1_1_55%]">
        {/* 게임 프레임 — 크기는 이 프레임이 결정, 캔버스는 100% 채우기만. 비율(16:9)에서 높이를
            파생하므로 왜곡·레터박스가 원천적으로 없고 클릭 좌표 변환이 단순 비례로 성립한다.
            정보 오버레이는 스테이지 코너 기준 — 프레임은 의도적으로 non-positioned. */}
        <div className="aspect-video w-[calc(var(--frame-h)*16/9)]">
          {/* key = 씬 전환 시 강제 리마운트 — 필드의 위치/상태머신 ref가 지역을 넘지 않게 */}
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
        <h3 className="pf-accent text-base text-gold">새 버전이 나왔어요</h3>
        <p className="text-xs leading-[1.7]">
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
