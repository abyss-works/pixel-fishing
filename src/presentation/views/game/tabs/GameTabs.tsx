import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { RejectReason } from '../../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { defaultZoneOfRegion } from '../../../../game/content/zones';
import type { ZoneId } from '../../../../game/content/zones';
import type { RegionId } from '../../../../game/content/places';
import { DEX_VIEWS, TAB_ORDER, type DexView, type TabKey } from './tabs';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import TabIcon from './TabIcon';
import VHelp from './help/VHelp';
import VRegion from './region/VRegion';
import BagTab from './bag/BagTab';
import DexTab from './dex/DexTab';
import SettingsTab from './settings/SettingsTab';
import VAdmin from './admin-tools/VAdmin';
import { setBagSection, useBagView } from './bag/bagView';
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
  const { section } = useBagView();

  const tabs = [
    { key: 'region' as const, label: '지역' },
    { key: 'bag' as const, label: '가방' },
    { key: 'dex' as const, label: '도감' },
    { key: 'help' as const, label: '도움말' },
    { key: 'settings' as const, label: '설정' },
    ...(isAdminVisible(props.account) ? [{ key: 'admin' as const, label: '관리자' }] : []),
  ].map(tab => ({ ...tab, icon: <TabIcon tab={tab.key} /> }));

  useKeyScope(event => {
    if (hasModifier(event)) return;
    // Tab = 활성 탭의 **첫 서브탭 줄** 순환(가방: 물고기↔아이템 · 도감: 일반→돌연변이→네임드).
    // 메뉴 탭은 숫자키만 바꾼다 — 같은 숫자를 다시 눌러도 보기는 움직이지 않는다.
    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      if (activeTab === 'bag') setBagSection(section === 'fish' ? 'items' : 'fish');
      else if (activeTab === 'dex') {
        const at = DEX_VIEWS.indexOf(dexView);
        setDexView(DEX_VIEWS[(at + direction + DEX_VIEWS.length) % DEX_VIEWS.length]);
      }
      return true;
    }

    const index = Number(event.key) - 1;
    if (event.key === '6' && isAdminVisible(props.account)) {
      event.preventDefault();
      setActiveTab('admin');
      return true;
    }
    if (Number.isInteger(index) && index >= 0 && index < TAB_ORDER.length) {
      event.preventDefault();
      setActiveTab(TAB_ORDER[index]);
      return true;
    }
  });

  return (
    <Sidebar tabs={tabs} activeKey={activeTab} onSelect={setActiveTab}>
      {activeTab === 'region' && <VRegion region={props.region} game={game} />}
      {activeTab === 'bag' && <BagTab game={game} dispatch={props.dispatch} setToast={props.setToast} />}
      {activeTab === 'dex' && <DexTab game={game} view={dexView} onView={setDexView} sub={dexZone} onSub={setDexZone} />}
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
