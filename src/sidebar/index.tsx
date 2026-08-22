import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import type { RegionId } from '../world';
import type { TabKey } from './tabs';
import TabBar from '../ui/TabBar';
import TabIcon from './TabIcon';
import HelpPanel from './HelpPanel';
import RegionTab from './RegionTab';
import BagTab from './BagTab';
import DexTab from './DexTab';
import SettingsTab from './SettingsTab';
import type { DexView } from './shared';

// 탭은 씬과 무관하게 항상 동일한 5개 (일관성 우선)
// 도감 탭만 라벨이 동적 — 활성 상태에서 한 번 더 누르면 일반↔돌연변이 보기 전환
const tabsFor = (dexView: DexView) => ([
  { key: 'region', label: '지역' },
  { key: 'bag', label: '가방' },
  { key: 'dex', label: dexView === 'base' ? '도감\n(일반)' : '도감\n(돌연변이)' },
  { key: 'help', label: '도움말' },
  { key: 'settings', label: '설정' },
] as const).map(t => ({ ...t, icon: <TabIcon tab={t.key} /> }));

interface SidebarProps {
  /** 현재 지역 — 거점 포함 모든 씬에서 전달된다 (집=마을, 항구=대양) */
  region: RegionId;
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  game: GameState;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (msg: string) => void;
  syncLabel: string | null;
  syncState: string;
  /** 로그인된 영구 계정 이메일 (게스트면 null) — v0.4.0 */
  account: string | null;
  /** 가입/로그인/로그아웃 직후 App이 계정 표시·세이브를 갱신하는 콜백 */
  onAuthChanged: () => Promise<void>;
}

// 우측 사이드바 — 상단 탭바 + 남은 공간을 채우는 탭 콘텐츠 
// 시설 패널(판매/강화/배)은 여기 소관이 아니다 — 게임 스테이지 모달(FacilityModal)로 뜬다.
export default function Sidebar(props: SidebarProps) {
  const { activeTab, setActiveTab, game } = props;
  const [dexView, setDexView] = useState<DexView>('base');

  // 활성 도감 탭을 한 번 더 누르면 일반↔돌연변이 전환
  const onSelect = (t: TabKey) => {
    if (t === 'dex' && activeTab === 'dex') setDexView(v => (v === 'base' ? 'variant' : 'base'));
    setActiveTab(t);
  };

  return (
    <aside className="w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line
                      max-[820px]:w-full max-[820px]:h-[45vh] max-[820px]:border-l-0 max-[820px]:border-t">
      <TabBar<TabKey> tabs={tabsFor(dexView)} activeKey={activeTab} onSelect={onSelect} />
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {activeTab === 'region' && <RegionTab region={props.region} game={game} />}
        {activeTab === 'bag' && <BagTab game={game} dispatch={props.dispatch} setToast={props.setToast} />}
        {activeTab === 'dex' && <DexTab game={game} region={props.region} view={dexView} />}
        {activeTab === 'help' && <HelpPanel />}
        {activeTab === 'settings' && (
          <SettingsTab game={game} dispatch={props.dispatch} setToast={props.setToast}
                       syncLabel={props.syncLabel} syncState={props.syncState}
                       account={props.account} onAuthChanged={props.onAuthChanged} />
        )}
      </div>
    </aside>
  );
}
