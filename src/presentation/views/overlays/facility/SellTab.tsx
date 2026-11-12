import { useMemo } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { selectSaleTab } from '../../../../features/inventory/model/saleWindow';
import { toggleSellRow, useSellView } from '../../game/tabs/bag/bagView';
import AdjustedAmount from '../../../ui/AdjustedAmount';
import Button from '../../../ui/Button';
import { fmtFishCount, fmtGold } from '../../../ui/format';
import FishPickTable from './FishPickTable';
import PickTab from './PickTab';

const flip = (set: ReadonlySet<string>, keys: readonly string[], on: boolean): Set<string> => {
  const next = new Set(set);
  for (const k of keys) { if (on) next.delete(k); else next.add(k); }
  return next;
};

// 판매 탭 — 가방의 물고기를 골라 골드로 바꾼다. 기본은 전부 선택이고 해제한 개체만 기록한다.
// 선택의 원자 단위는 개체(uid)다. 행 체크는 그 행 전부를 켜고 끄는 단축이고, 줄을 펼치면 개체 하나씩 고를 수 있다.
// 잠근 개체는 고를 수 없고(가방 탭에서 해제) 표의 자물쇠가 알린다. 판매를 확정하면 창을 닫는다.
// 해제한 개체의 기록(excluded)은 창이 들고 있어 탭을 오가도 남는다.
export default function SellTab({ game, sellBonus, excluded, setExcluded, busy, onSell }: {
  game: GameState;
  sellBonus: number;
  excluded: ReadonlySet<string>;
  setExcluded: (update: (prev: Set<string>) => Set<string>) => void;
  busy: boolean;
  onSell: (uids: string[]) => void;
}) {
  const { collapsed } = useSellView(); // 어종 행 펼침 — 가방 탭과 별개 저장소
  const view = useMemo(() => selectSaleTab(game, excluded, sellBonus), [game, excluded, sellBonus]);

  const table = (
    <FishPickTable rows={view.rows} expanded={collapsed} onToggleExpand={toggleSellRow}
                   onToggleRow={(uids, allOn) => setExcluded(prev => flip(prev, uids, !allOn))}
                   onToggleOne={uid => setExcluded(prev => flip(prev, [uid], prev.has(uid)))}
                   action="판매" heads={{ check: '판매', value: '소계' }}
                   valueOf={row => fmtGold(row.selectedSubtotal)} emptyValue="0G" />
  );

  return (
    <PickTab empty={game.bag.length === 0} table={table}
      compareHeads={['현재', '판매 후']}
      compareRows={[
        { label: '골드', value: fmtGold(view.gold.current), next: fmtGold(view.gold.after), dim: view.gold.current === view.gold.after },
        { label: '가방', value: fmtFishCount(view.bag.current), next: fmtFishCount(view.bag.after), dim: view.bag.current === view.bag.after },
      ]}
      summary={{ label: '판매할 물고기', value: <span className="pf-accent">{fmtFishCount(view.count)}</span>, dim: view.count === 0 }}
      notes={['판매한 물고기는 되찾을 수 없어요.', '도감과 명성은 그대로 남아요.']}
      actions={(
        <Button variant="primary" full disabled={view.total.value === 0 || busy} onClick={() => onSell(view.soldUids)}>
          판매 (+<AdjustedAmount amount={view.total} inButton />)
        </Button>
      )} />
  );
}
