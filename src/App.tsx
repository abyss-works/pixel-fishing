import { useState } from 'react';
import type { FurnitureId, RegionId } from './world';
import Base from './stage/Base';
import Field from './stage/Field';
import FacilityModal from './stage/FacilityModal';
import MessageLog from './stage/MessageLog';
import Sidebar from './sidebar';
import { DEFAULT_TAB } from './sidebar/tabs';
import type { TabKey } from './sidebar/tabs';
import type { ActionPanel } from './stage/FacilityModal';
import { useCloudSync } from './hooks/useCloudSync';
import { useAccount } from './hooks/useAccount';
import { useMessageLog } from './hooks/useMessageLog';

// 앱 셸 (계층: layout) — 씬 그래프·탭·정비 패널 상태와 화면 배치만 소유한다.
// 게임 상태/동기화는 useCloudSync, 계정은 useAccount, 로그는 useMessageLog (service&state 계층).

// 장면: 집 ⟷ 마을 필드 ⟷ (포구, 배 필요) ⟷ 대양 필드 ⟷ 항구
type Scene = 'home' | 'village' | 'harbor' | 'ocean';
// 씬 → 소속 지역 (지역 탭·도감이 거점에서도 현재 지역 정보를 알 수 있게)
const sceneRegion = (s: Scene): RegionId => (s === 'home' || s === 'village') ? 'village' : 'ocean';

export default function App() {
  // 시스템 메시지 로그 — MMO 채팅창처럼 흘러가는 기록 (좌하단 오버레이)
  const { log, setToast } = useMessageLog([
    '집이다. 가구를 클릭해 정비하고, 문으로 나가 마을 물가에서 낚시하자.',
  ]);
  const { game, setGame, sync, syncLabel, userIdRef, dirtyRef } = useCloudSync({ setToast });
  const { account, onAuthChanged } = useAccount({ game, setGame, setToast, sync, userIdRef, dirtyRef });

  const [scene, setScene] = useState<Scene>('home');
  // 우측 사이드바 상태 — 탭은 씬 무관 5개 고정, 씬이 바뀌면 열린 시설 패널만 닫는다
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);

  const go = (s: Scene, msg: string) => { setScene(s); setToast(msg); setActionPanel(null); };

  // 미니맵 클릭 → 지역 탭 열기 (M 키 트리거는 폐지)
  // TODO: 월드맵 화면(지역 간 이동/전체 지구 조망)이 생기면 미니맵 클릭은 그쪽으로 연결한다.
  const onOpenMap = () => setActiveTab('region');

  // 거점 시설 클릭(캔버스) — 정비 시설은 스테이지 모달, 도감은 탭 전환, 문/여객선은 장면 이동
  const facilityHandler = (goFieldFn: () => void, goTravelFn?: () => void) =>
    (id: FurnitureId) => {
      switch (id) {
        case 'sell': case 'rod': case 'boat':
          setActionPanel(p => (p === id ? null : id));
          return;
        case 'dex':
          setActionPanel(null);
          setActiveTab('dex');
          return;
        case 'exit':
          goFieldFn();
          return;
        case 'travel':
          goTravelFn?.();
          return;
      }
    };

  const currentFacility =
    scene === 'home' ? facilityHandler(() => go('village', '마을이다. 물가 군집에서 낚시하자.')) :
    scene === 'harbor' ? facilityHandler(
      () => go('ocean', '출항! 군집 위에서 스페이스로 캐스팅.'),
      () => go('village', '여객선을 타고 마을로 돌아왔다.')) :
    undefined;

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
          {scene === 'home' && <Base base="home" game={game} onFacility={currentFacility} />}
          {scene === 'village' && (
            <Field region="village" game={game} setGame={setGame} setToast={setToast}
                   goBase={() => go('home', '집이다. 시설을 눌러 정비하자.')}
                   goTravel={() => go('ocean', '대양으로 출항! 태평양 군집을 찾아 항해하자.')}
                   onOpenMap={onOpenMap}
                   onShop={() => setActionPanel(p => (p === 'boat' ? p : 'boat'))} />
          )}
          {scene === 'harbor' && <Base base="harbor" game={game} onFacility={currentFacility} />}
          {scene === 'ocean' && (
            <Field region="ocean" game={game} setGame={setGame} setToast={setToast}
                   goBase={() => go('harbor', '항구에 접안했다. 시설을 눌러 정비하자.')}
                   onOpenMap={onOpenMap} />
          )}

          {/* 시스템 메시지 로그 — 스테이지 좌하단 (미래 v0.9 실시간 채팅 자리) */}
          <MessageLog log={log} />

          {/* 정비 모달 — 판매/강화/배 (정비 중엔 이동하지 않으므로 게임 영역을 점유해도 자연스럽다) */}
          {actionPanel && (
            <FacilityModal panel={actionPanel} game={game} setGame={setGame}
                           setToast={setToast} onClose={() => setActionPanel(null)} />
          )}
        </div>
      </div>

      <Sidebar
        region={sceneRegion(scene)}
        activeTab={activeTab} setActiveTab={setActiveTab}
        game={game} setGame={setGame} setToast={setToast}
        syncLabel={syncLabel} syncState={sync}
        account={account} onAuthChanged={onAuthChanged}
      />
    </div>
  );
}
