import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import type { RegionId } from '../world';
import { SUB_TABS, TAB_ORDER } from './tabs';
import type { TabKey } from './tabs';
import { hasModifier, useKeyScope } from '../hotkeys';
import TabBar from '../ui/TabBar';
import TabIcon from './TabIcon';
import HelpPanel from './HelpPanel';
import RegionTab from './RegionTab';
import BagTab from './BagTab';
import DexTab from './DexTab';
import SettingsTab from './SettingsTab';
import { setBagLayout, useBagView } from './bagView';
import type { DexView } from './shared';

// 탭은 씬과 무관하게 항상 동일한 5개 (일관성 우선)
// 가방·도감은 라벨이 동적 — 활성 상태에서 한 번 더 누르면 보기가 전환된다.
// 보기 전환을 탭 자리에서 하므로 콘텐츠 안에 별도 토글 줄을 두지 않는다(세로 공간 절약).
const tabsFor = (dexView: DexView, bagCards: boolean) => ([
  { key: 'region', label: '지역' },
  { key: 'bag', label: bagCards ? '가방\n(카드)' : '가방\n(목록)' },
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
  const { layout } = useBagView();

  // 활성 탭을 한 번 더 누르면 그 탭의 보기가 전환된다 (가방: 목록↔카드 / 도감: 일반↔돌연변이)
  const onSelect = (t: TabKey) => {
    if (t === 'dex' && activeTab === 'dex') setDexView(v => (v === 'base' ? 'variant' : 'base'));
    if (t === 'bag' && activeTab === 'bag') setBagLayout(layout === 'list' ? 'cards' : 'list');
    setActiveTab(t);
  };

  // 키보드 단축키 — 축이 둘이다.
  //   숫자 1~5 = **부모 탭** 직행(5개). 세부 보기는 건드리지 않는다 — 가방을 카드로 보던
  //              사람은 2를 눌러도 카드로 돌아온다(마지막 상태 유지가 덜 놀랍다).
  //   Tab      = 세부까지 펼친 **7칸 순환**. Shift+Tab은 역방향.
  // 화면에 표기하지 않는다(사용자 결정) — 도움말 정리 때 함께 적는다.
  useKeyScope(e => {
    if (hasModifier(e)) return; // Ctrl+1은 브라우저 탭 전환이다

    if (e.key === 'Tab') {
      e.preventDefault();
      // 지금 몇 번째 칸인가 — 보기 축이 없는 탭은 탭 이름만으로 정해진다
      const at = SUB_TABS.findIndex(s => s.tab === activeTab
        && (s.bag === undefined || s.bag === layout)
        && (s.dex === undefined || s.dex === dexView));
      const next = SUB_TABS[((at < 0 ? 0 : at) + (e.shiftKey ? -1 : 1) + SUB_TABS.length)
        % SUB_TABS.length];
      setActiveTab(next.tab);
      if (next.bag) setBagLayout(next.bag);
      if (next.dex) setDexView(next.dex);
      return true;
    }

    const i = Number(e.key) - 1; // '1'~'5' — 탭바에 보이는 순서 그대로
    if (Number.isInteger(i) && i >= 0 && i < TAB_ORDER.length) {
      e.preventDefault();
      setActiveTab(TAB_ORDER[i]);
      return true;
    }
  });

  return (
    <aside className="w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line
                      max-[820px]:w-full max-[820px]:h-[45vh] max-[820px]:border-l-0 max-[820px]:border-t">
      <TabBar<TabKey> tabs={tabsFor(dexView, layout === 'cards')} activeKey={activeTab} onSelect={onSelect} />
      <div className="pf-scroll flex-1 overflow-y-auto p-3 flex flex-col gap-2">
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
