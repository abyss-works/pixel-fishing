import { useMemo, useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { BAIT_BUY_MAX } from '../../../../game/rules/balance';
import { createBaitQuantities, normalizeBaitQuantity, selectBaitShopRows } from '../../../../features/gameplay/model/facility';
import ColorSwatch from '../../../ui/ColorSwatch';
import CostBox from '../../../ui/CostBox';
import CostLine from '../../../ui/CostLine';
import Frame from '../../../ui/Frame';
import HeroHeader from '../../../ui/HeroHeader';
import Inset from '../../../ui/Inset';
import ListRow from '../../../ui/ListRow';
import NumberStepper from '../../../ui/NumberStepper';
import PriceTag from '../../../ui/PriceTag';
import Tip from '../../../ui/Tip';
import { artifactEffectLabel, fmtCutPercent } from '../../../ui/artifactEffects';
import { baitEffectLine } from '../../../ui/baitEffects';
import { fmtGold } from '../../../ui/format';
import { RarityText } from '../../../ui/fish/RarityTag';
import FacilityCard from './FacilityCard';
import { CompareTable, ConfirmButton } from './facilityParts';

// 미끼 상점(향료전) — 콜롬보항 전용. 왼쪽은 미끼 목록(색 칸, 이름, 노리는 등급, 보유, 1개 가격)이고 아무 행이나 고를 수 있다.
// 오른쪽은 고른 미끼의 머리, 효과, 보유 비교, 수량이다. 합계와 잔액, 구매 버튼의 자리는 FacilityCard가 폭에 따라 정한다. 미끼 소모와 켜는 곳은 "효과"의 툴팁이다.
// 가격은 실제 차감액과 같은 함수(baitCost)로 보이고, 할인이 있으면 정가에 취소선을 긋는다.
// 활성 토글은 가방 탭 소관이다. 상점은 파는 곳만 맡는다.
export default function ShopPanel({ game, onBuy, onClose, busy }: {
  game: GameState;
  onBuy: (baitId: string, count: number) => void;
  onClose: () => void; busy: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>(createBaitQuantities);
  const rows = useMemo(() => selectBaitShopRows(game, qty, busy), [game, qty, busy]);
  const [selectedId, setSelectedId] = useState(() => rows[0].bait.id);
  const sel = rows.find(r => r.bait.id === selectedId) ?? rows[0];

  return (
    <FacilityCard title="향료전" onClose={onClose}
      list={
        <Inset className="p-2">
          <div role="listbox" aria-label="미끼 목록" className="flex flex-col gap-1.5">
            {rows.map(r => (
              <ListRow key={r.bait.id} state={r.bait.id === sel.bait.id ? 'selected' : 'open'}
                       onSelect={() => setSelectedId(r.bait.id)}
                       leading={<ColorSwatch color={r.bait.color} />}
                       name={r.bait.name}
                       subs={[<b key="rarity"><RarityText rarity={r.bait.targetRarity} /></b>, <>보유 <span className="pf-accent">{r.owned}</span></>]}
                       trailing={<PriceTag list={r.bait.price} price={r.unitPrice} />} />
            ))}
          </div>
        </Inset>
      }
      summary={
        <CostBox>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-text-dim">합계</span>
            <PriceTag list={sel.listTotal} price={sel.total} />
          </div>
          <CostLine have={game.gold} delta={-sel.total} />
        </CostBox>
      }
      confirm={
        <ConfirmButton reason={game.gold < sel.total ? REJECT_TEXT['not-enough-gold'] : null}
                       disabled={!sel.canAfford} onClick={() => onBuy(sel.bait.id, sel.count)}>
          구매 (-{fmtGold(sel.total)})
        </ConfirmButton>
      }
      detail={<>
          <HeroHeader sprite={<ColorSwatch color={sel.bait.color} big />}
                       title={sel.bait.name}
                       tags={[
                         <><RarityText rarity={sel.bait.targetRarity} /> 미끼</>,
                         <>보유 <span className="pf-accent">{sel.owned}</span>개</>,
                         ...(sel.discountRate > 0 ? [<>{artifactEffectLabel('baitDiscount')} <span className="pf-accent">{fmtCutPercent(sel.discountRate)}</span></>] : []),
                       ]} />
          <Inset className="px-3 py-2.5 flex flex-col gap-1.5">
            <span className="text-2xs text-text-dim">
              <Tip text={<>직접 낚아 올릴 때마다 하나씩 줄어요. 방치 낚시에는 쓰이지 않아요.<br />가방 탭의 아이템에서 켜요. 한 번에 하나만 켜져요.</>}>효과</Tip>
            </span>
            <span className="text-xs">{sel.bait.desc}<br />{baitEffectLine(sel.bait)}</span>
          </Inset>
          <CompareTable heads={['현재', '구매 후']} rows={[
            { label: '보유', value: `${sel.owned}개`, next: `${sel.owned + sel.count}개`, delta: `+${sel.count}` },
            { label: '1개 가격', next: <PriceTag list={sel.bait.price} price={sel.unitPrice} /> },
          ]} />
          <Frame className="bg-surface-2 px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-text-dim">수량</span>
            <NumberStepper value={sel.count} min={1} max={BAIT_BUY_MAX} disabled={busy} variant="inline"
                           ariaLabel={sel.bait.name}
                           onChange={v => setQty(prev => ({ ...prev, [sel.bait.id]: normalizeBaitQuantity(v) }))} />
          </Frame>
      </>} />
  );
}
