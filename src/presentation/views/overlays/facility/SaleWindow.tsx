import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { BaseId } from '../../../../game/content/places';
import { energyTabLock } from '../../../../features/display/model/menuLock';
import { SALE_TABS, saleWindowTitle } from '../../../../features/inventory/model/saleWindow';
import type { SaleWindowTab } from '../../../../features/inventory/model/saleWindow';
import type { EnergyPicks } from '../../../../features/kitchen/model/energy';
import type { Notify } from '../../../ui/hud/messageFeed';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import EnergyTab from './EnergyTab';
import SellTab from './SellTab';
import type { FacilityAct } from './facilityParts';

// 판매 창 — 집의 궤짝과 항구의 어시장이 같은 창을 쓴다. 920 폭, 높이 고정. 창 위에 탭 둘(판매, 기운 얻기)을 두고,
// 두 탭은 같은 어종 표와 같은 두 칸 구성(오른쪽에 비교 표와 확정 영역)을 쓴다. 고정 정보 줄은 두지 않는다.
// 기운 얻기 탭은 증기선 전에는 잠긴 탭으로 보이고, 게스트에게는 게스트 잠금으로 보인다(게스트 잠금이 먼저다).
// 두 탭의 선택 상태는 따로 두고, 창이 들고 있어 탭을 오가도 남는다.
export default function SaleWindow({ game, base, guest, sellBonus, busy, act, onSell, setToast, onClose }: {
  game: GameState;
  base: BaseId;
  guest: boolean;
  /** 길드 판매가 보너스 비율 */
  sellBonus: number;
  busy: boolean;
  act: FacilityAct;
  /** 판매 확정 — 호출부가 창을 닫는다 */
  onSell: (uids: string[]) => void;
  setToast: Notify;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SaleWindowTab>('sell');
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set()); // 판매 탭: 해제한 개체의 uid
  const [picks, setPicks] = useState<EnergyPicks>({}); // 기운 얻기 탭: 직접 고른 개체
  const energyLock = energyTabLock(guest, game.boat);

  return (
    <ModalCard title={saleWindowTitle(base)} onClose={onClose} fixed>
      <TabBar
        tabs={SALE_TABS.map(t => t.key === 'energy' && energyLock.kind !== 'none' ? { ...t, lock: energyLock.lines } : t)}
        activeKey={tab}
        onSelect={setTab}
      />
      {tab === 'sell'
        ? <SellTab game={game} sellBonus={sellBonus} excluded={excluded} setExcluded={setExcluded} busy={busy} onSell={onSell} />
        : <EnergyTab game={game} busy={busy} act={act} setToast={setToast} picks={picks} setPicks={setPicks} />}
    </ModalCard>
  );
}
