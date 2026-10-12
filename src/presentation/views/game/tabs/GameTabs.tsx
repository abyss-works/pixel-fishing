import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { RejectReason } from '../../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/model/types';
import { ZONE_IDS, defaultZoneOfRegion } from '../../../../game/content/zones';
import type { ZoneId } from '../../../../game/content/zones';
import type { RegionId } from '../../../../game/content/places';
import { TAB_ORDER, type TabKey } from './tabs';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import TabIcon from './TabIcon';
import VHelp from './help/VHelp';
import VRegion from './region/VRegion';
import BagTab from './bag/BagTab';
import DexTab from './dex/DexTab';
import SettingsTab from './settings/SettingsTab';
import VAdmin from './admin-tools/VAdmin';
import { setBagLayout, useBagView } from './bag/bagView';
import type { DexView } from './dex/DexTab';
import { isAdminUrl, isLocalOrigin, OWNER_EMAIL } from '../../../../features/admin/model/gate';
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
  const { layout } = useBagView();

  const tabs = [
    { key: 'region' as const, label: '지역' },
    { key: 'bag' as const, label: layout === 'cards' ? '가방\n(카드)' : '가방\n(목록)' },
    { key: 'dex' as const, label: dexView === 'base' ? '도감\n(일반)' : dexView === 'variant' ? '도감\n(돌연변이)' : '도감\n(네임드)' },
    { key: 'help' as const, label: '도움말' },
    { key: 'settings' as const, label: '설정' },
    ...(isAdminVisible(props.account) ? [{ key: 'admin' as const, label: '관리자' }] : []),
  ].map(tab => ({ ...tab, icon: <TabIcon tab={tab.key} /> }));

  const select = (tab: TabKey) => {
    if (tab === activeTab && tab === 'dex') {
      setDexView(view => view === 'base' ? 'variant' : view === 'variant' ? 'named' : 'base');
    }
    if (tab === activeTab && tab === 'bag') setBagLayout(layout === 'list' ? 'cards' : 'list');
    setActiveTab(tab);
  };

  useKeyScope(event => {
    if (hasModifier(event)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      if (activeTab === 'bag') setBagLayout(layout === 'list' ? 'cards' : 'list');
      else if (activeTab === 'dex') {
        const at = Math.max(0, ZONE_IDS.indexOf(dexZone));
        setDexZone(ZONE_IDS[(at + direction + ZONE_IDS.length) % ZONE_IDS.length]);
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
