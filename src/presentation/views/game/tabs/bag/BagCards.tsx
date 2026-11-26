import { useMemo, useState } from 'react';
import type { Fish, FishInstance, GameState } from '../../../../../game/rules/logic';
import { selectBagCatalog } from '../../../../../features/inventory/model/catalog';
import { cx } from '../../../../ui/cx';
import Divider from '../../../../ui/Divider';
import Frame from '../../../../ui/Frame';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RARITY_CARD, DIM_CARD } from '../../../../ui/fish/RarityTag';
import DexDetail from '../dex/DexDetail';

// 가방 카드뷰 — 목록뷰가 정보 집약(개체 한 줄씩)이라면 이쪽은 **현황 한눈에**다.
// 그래서 전 어종을 깔고 보유 마릿수만 얹는다: 뭘 들고 있고 뭐가 비었는지가 한 화면에 보인다.
// 미발견은 도감과 같은 규칙으로 ??? — 카드뷰가 도감 스포일러 우회로가 되면 안 된다.
//
// 정렬: **보유중 → 발견함 → 미발견**, 각 무리 안에서는 **등급 내림차순 → 가격 내림차순**
// (목록뷰와 같은 축. 도감 순은 그다음 안정화 타이브레이커).
// 지금 쓸 수 있는 것이 맨 위로 모이고, 미발견 ??? 카드가 중간에 끼어 보유분을 갈라놓지 않는다.
// 무리가 바뀌는 건 잡거나 팔 때뿐이라 카드가 눈앞에서 튀지도 않는다.
export default function BagCards({ bag, game }: { bag: readonly FishInstance[]; game: GameState }) {
  const catalog = useMemo(() => selectBagCatalog(bag, game), [bag, game]);
  const [detail, setDetail] = useState<{ fish: Fish; initialForm: number } | null>(null);

  return (
    <>
    <div className="grid grid-cols-3 gap-2">
      {catalog.map(({ fish: f, name, shown, normalCount, variantCount, discovered: known }) => {
        const n = normalCount + variantCount;
        const label = !known ? '미확인 어종'
          : n === 0 ? `${f.name} 미보유`
          : `${f.name} 일반 ${normalCount}마리 돌연변이 ${variantCount}마리 보유`;
        const body = (
          <>
            <FishSprite fish={f} preset="icon" form={shown.form} discovered={known}
                        ariaLabel="" className="block mx-auto mb-1" />
            {/* 가방은 "내가 지금 뭘 들고 있나"만 본다 — 등급은 테두리가, 미발견은 ???가 말한다.
                안 들고 있는 종에 0을 적거나 "미확인"을 덧붙이면 읽을 게 늘기만 한다. */}
            <b className="block truncate">{known ? name : '???'}</b>
            {n > 0 && (
              /* 일반/변이를 한 행에 — 흰 글씨 일반, 자홍 변이, 사이에 얇은 구분 바 */
              <span className="pf-accent inline-flex items-center justify-center gap-1.5">
                <span className={normalCount > 0 ? 'text-text' : 'text-text-dim'}>{normalCount}</span>
                <Divider vertical className="h-2.5 min-h-0" />
                <span className={variantCount > 0 ? 'text-mutation' : 'text-text-dim'}>{variantCount}</span>
              </span>
            )}
          </>
        );
        return known ? (
          <Frame as="button" type="button" key={f.id} data-rarity={f.rarity}
                 onClick={() => setDetail({ fish: f, initialForm: shown.index })}
                 className={cx(RARITY_CARD, 'p-2 text-sm text-center cursor-pointer hover:border-accent',
                   n === 0 && DIM_CARD)}
                 aria-label={label}>
            {body}
          </Frame>
        ) : (
          <div key={f.id} data-rarity={f.rarity}
               className={cx(RARITY_CARD, 'p-2 text-sm bg-bg border-line text-text-dim')}
               aria-label={label}>
            {body}
          </div>
        );
      })}
    </div>
    {detail && <DexDetail fish={detail.fish} game={game} initialForm={detail.initialForm} onClose={() => setDetail(null)} />}
    </>
  );
}
