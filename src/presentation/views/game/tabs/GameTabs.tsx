import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { RejectReason } from '../../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { ZONE_IDS, defaultZoneOfRegion } from '../../../../game/content/zones';
import type { ZoneId } from '../../../../game/content/zones';
import type { RegionId } from '../../../../game/content/places';
import { DEX_VIEWS, TAB_ORDER, type DexView, type TabKey } from './tabs';
import { selectNamedDex } from '../../../../features/dex/model/catalog';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import TabIcon from './TabIcon';
import VHelp from './help/VHelp';
import VRegion from './region/VRegion';
import BagTab from './bag/BagTab';
import DexTab from './dex/DexTab';
import SettingsTab from './settings/SettingsTab';
import VAdmin from './admin-tools/VAdmin';
import { setBagLayout, setBagSection, useBagView } from './bag/bagView';
import { isAdminUrl, isLocalOrigin, OWNER_EMAIL } from '../../admin/gate';
import Sidebar from '../../../layouts/sidebar';

interface GameTabsProps {
  region: RegionId;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  game: GameState;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: (message: string) => void;
  syncLabel: string | null;
  syncState: string;
  account: string | null;
  nickname: string | null;
  onRename: (name: string) => Promise<null | RejectReason>;
  uid: string | null;
  onAuthChanged: () => Promise<void>;
}

const isAdminVisible = (account: string | null) =>
  isAdminUrl() && (isLocalOrigin() || (account ?? '').toLowerCase() === OWNER_EMAIL);

export default function GameTabs(props: GameTabsProps) {
  const { activeTab, setActiveTab, game } = props;
  const [dexView, setDexView] = useState<DexView>('base');
  const [dexZone, setDexZone] = useState<ZoneId>(defaultZoneOfRegion(props.region));
  const { layout, section } = useBagView();

  const tabs = [
    { key: 'region' as const, label: '지역' },
    { key: 'bag' as const, label: layout === 'cards' ? '가방\n(카드)' : '가방\n(목록)' },
    { key: 'dex' as const, label: dexView === 'base' ? '도감\n(일반)' : dexView === 'variant' ? '도감\n(돌연변이)' : '도감\n(네임드)' },
    { key: 'help' as const, label: '도움말' },
    { key: 'settings' as const, label: '설정' },
    ...(isAdminVisible(props.account) ? [{ key: 'admin' as const, label: '관리자' }] : []),
  ].map(tab => ({ ...tab, icon: <TabIcon tab={tab.key} /> }));

  // 메뉴 탭 선택(클릭·숫자키). 이미 열린 탭을 다시 고르면 그 탭의 보기를 순환한다
  // (가방: 목록↔카드 · 도감: 일반→돌연변이→네임드). 현재 보기는 탭 라벨 둘째 줄이 보여 준다.
  const select = (tab: TabKey) => {
    if (tab === activeTab && tab === 'dex') {
      setDexView(DEX_VIEWS[(DEX_VIEWS.indexOf(dexView) + 1) % DEX_VIEWS.length]);
    }
    if (tab === activeTab && tab === 'bag') setBagLayout(layout === 'list' ? 'cards' : 'list');
    setActiveTab(tab);
  };

  // 도감 지역 서브탭 순서 — 네임드는 수배가 있는 존만 서브탭에 있다(selectNamedDex).
  // 열람 존이 목록에 없으면 화면은 첫 존을 보이므로 그 위치에서 출발한다.
  const cycleDexZone = (direction: 1 | -1) => {
    const ids = dexView === 'named' ? selectNamedDex(game, dexZone).zones.map(z => z.id) : ZONE_IDS;
    const at = Math.max(0, ids.indexOf(dexZone));
    setDexZone(ids[(at + direction + ids.length) % ids.length]);
  };

  useKeyScope(event => {
    if (hasModifier(event)) return;
    // Tab / Shift+Tab = 활성 탭의 서브탭 순환(가방: 물고기↔아이템 · 도감: 지역). 메뉴 탭은 숫자키만 바꾼다.
    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      if (activeTab === 'bag') setBagSection(section === 'fish' ? 'items' : 'fish');
      else if (activeTab === 'dex') cycleDexZone(direction);
      return true;
    }

    const index = Number(event.key) - 1;
    if (event.key === '6' && isAdminVisible(props.account)) {
      event.preventDefault();
      select('admin');
      return true;
    }
    if (Number.isInteger(index) && index >= 0 && index < TAB_ORDER.length) {
      event.preventDefault();
      select(TAB_ORDER[index]);
      return true;
    }
  });

  return (
    <Sidebar tabs={tabs} activeKey={activeTab} onSelect={select}>
      {activeTab === 'region' && <VRegion region={props.region} game={game} />}
      {activeTab === 'bag' && <BagTab game={game} dispatch={props.dispatch} setToast={props.setToast} />}
      {activeTab === 'dex' && <DexTab game={game} view={dexView} sub={dexZone} onSub={setDexZone} />}
      {activeTab === 'help' && <VHelp />}
      {activeTab === 'settings' && (
        <SettingsTab game={game} dispatch={props.dispatch} setToast={props.setToast}
                     syncLabel={props.syncLabel} syncState={props.syncState}
                     account={props.account} uid={props.uid}
                     nickname={props.nickname} onRename={props.onRename}
                     onAuthChanged={props.onAuthChanged} />
      )}
      {activeTab === 'admin' && <VAdmin game={game} dispatch={props.dispatch} />}
    </Sidebar>
  );
}
