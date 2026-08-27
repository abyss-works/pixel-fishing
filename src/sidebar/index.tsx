import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { REGION_IDS } from '../world';
import type { RegionId } from '../world';
import { TAB_ORDER } from './tabs';
import type { TabKey } from './tabs';
import { hasModifier, useKeyScope } from '../hotkeys';
import TabBar from '../ui/TabBar';
import TabIcon from './TabIcon';
import HelpPanel from './HelpPanel';
import RegionTab from './RegionTab';
import BagTab from './BagTab';
import DexTab from './DexTab';
import SettingsTab from './SettingsTab';
import AdminTab from './AdminTab';
import { setBagLayout, useBagView } from './bagView';
import type { DexView } from './shared';
import { isAdminUrl, isLocalOrigin, OWNER_EMAIL } from './shared';

// 탭은 씬과 무관하게 항상 5개 고정 + 조건부 관리자 탭(별도 — isAdminVisible).
// 관리자 탭은 ?admin && (로컬 또는 소유자 계정)일 때만 6번 탭으로 노출된다.
// 가방·도감의 라벨은 동적 — 같은 탭 재선택 시 보기가 순환한다.
const isAdminVisible = (account: string | null) =>
  isAdminUrl() && (isLocalOrigin() || (account ?? '').toLowerCase() === OWNER_EMAIL);

const tabsFor = (dexView: DexView, bagCards: boolean, account: string | null) => {
  const base = [
    { key: 'region' as const, label: '지역' },
    { key: 'bag' as const, label: bagCards ? '가방\n(카드)' : '가방\n(목록)' },
    { key: 'dex' as const, label: dexView === 'base' ? '도감\n(일반)' : '도감\n(돌연변이)' },
    { key: 'help' as const, label: '도움말' },
    { key: 'settings' as const, label: '설정' },
  ] as const;
  const all = isAdminVisible(account)
    ? [...base, { key: 'admin' as const, label: '관리자' }] as const
    : base;
  return (all as readonly { key: TabKey; label: string }[]).map(
    t => ({ ...t, icon: <TabIcon tab={t.key} /> }));
};

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
  /** 내 uid — 설정 탭에 띄운다. 문의 대응 시 세이브를 찾는 열쇠 */
  uid: string | null;
  /** 가입/로그인/로그아웃 직후 App이 계정 표시·세이브를 갱신하는 콜백 */
  onAuthChanged: () => Promise<void>;
}

// 우측 사이드바 — 상단 탭바 + 남은 공간을 채우는 탭 콘텐츠 
// 시설 패널(판매/강화/배)은 여기 소관이 아니다 — 게임 스테이지 모달(FacilityModal)로 뜬다.
export default function Sidebar(props: SidebarProps) {
  const { activeTab, setActiveTab, game } = props;
  const [dexView, setDexView] = useState<DexView>('base');
  // 도감의 열람 지역 — 서브탭 클릭과 Tab 키(지역 순환)가 같은 상태를 쓴다(Sidebar 소유).
  const [dexRegion, setDexRegion] = useState<RegionId>(props.region);
  const { layout } = useBagView();

  // 탭 선택의 단일 관문 — 탭바 클릭과 숫자키가 같은 규칙을 쓴다.
  // 같은 탭을 한 번 더 고르면 그 탭의 **보기**가 순환된다(가방: 목록↔카드 · 도감: 일반↔돌연변이).
  const select = (t: TabKey) => {
    if (t === activeTab && t === 'dex') setDexView(v => (v === 'base' ? 'variant' : 'base'));
    if (t === activeTab && t === 'bag') setBagLayout(layout === 'list' ? 'cards' : 'list');
    // 다른 탭에서 도감으로 들어오면 현재 씬 지역부터 본다 — 탭 밖에서는 기억하지 않는다
    if (t === 'dex' && activeTab !== 'dex') setDexRegion(props.region);
    setActiveTab(t);
  };

  // 키보드 단축키 — 축이 둘이다.
  //   숫자 1~5 = 탭 **선택**(관리자 6). 같은 탭 재입력이면 select()가 보기를 순환한다.
  //   Tab      = **탭 내부** 페이지 순환 — 메뉴 탭을 넘나들지 않는다.
  //              가방: 목록↔카드 · 도감: 지역 순환 · 나머지: 페이지가 없어 소비만 한다.
  useKeyScope(e => {
    if (hasModifier(e)) return; // Ctrl+1은 브라우저 탭 전환이다

    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      if (activeTab === 'bag') {
        setBagLayout(layout === 'list' ? 'cards' : 'list');
      } else if (activeTab === 'dex') {
        const at = Math.max(0, REGION_IDS.indexOf(dexRegion));
        setDexRegion(REGION_IDS[(at + dir + REGION_IDS.length) % REGION_IDS.length]);
      }
      return true;
    }

    const i = Number(e.key) - 1; // '1'~'5' — 탭바에 보이는 순서 그대로
    // 관리자 탭은 조건부라 TAB_ORDER에 없다 — 6번은 별도 분기
    if (e.key === '6' && isAdminVisible(props.account)) {
      e.preventDefault();
      setActiveTab('admin' as TabKey);
      return true;
    }
    if (Number.isInteger(i) && i >= 0 && i < TAB_ORDER.length) {
      e.preventDefault();
      select(TAB_ORDER[i]);
      return true;
    }
  });

  return (
    <aside className="w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line
                      max-[820px]:w-full max-[820px]:h-[45vh] max-[820px]:border-l-0 max-[820px]:border-t">
      <TabBar<TabKey> tabs={tabsFor(dexView, layout === 'cards', props.account)} activeKey={activeTab} onSelect={select} />
      <div className="pf-scroll flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {activeTab === 'region' && <RegionTab region={props.region} game={game} />}
        {activeTab === 'bag' && <BagTab game={game} dispatch={props.dispatch} setToast={props.setToast} />}
        {activeTab === 'dex' && <DexTab game={game} view={dexView} sub={dexRegion} onSub={setDexRegion} />}
        {activeTab === 'help' && <HelpPanel />}
        {activeTab === 'settings' && (
          <SettingsTab game={game} dispatch={props.dispatch} setToast={props.setToast}
                       syncLabel={props.syncLabel} syncState={props.syncState}
                       account={props.account} uid={props.uid}
                       onAuthChanged={props.onAuthChanged} />
        )}
        {activeTab === 'admin' && <AdminTab game={game} dispatch={props.dispatch} />}
      </div>
    </aside>
  );
}
