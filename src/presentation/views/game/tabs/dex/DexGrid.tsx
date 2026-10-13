import { useMemo, useState } from 'react';
import type { Fish, FormId, GameState } from '../../../../../game/rules/logic';
import { zoneById } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { selectDexGrid } from '../../../../../features/dex/model/catalog';
import { cx } from '../../../../ui/cx';
import SubTabs from '../../../../ui/SubTabs';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityText, RarityDot, RARITY_CARD } from '../../../../ui/fish/RarityTag';
import type { DexView } from './DexTab';
import DexDetail from './DexDetail';

// 일반/돌연변이 공용 격자 — 폼별 발견 기준만 다르다. 변이는 별개 개체라 변이만 잡은 종은
// 기본 도감에서 여전히 ??? (v0.3.3)
export default function DexGrid({ game, view, sub, onSub }: {
  game: GameState;
  view: DexView;
  /** 열람 중인 최상위 존 — GameTabs 소유(Tab 키 존 순환과 상태 공유) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  // 폼별 발견 기준 — 변이는 별개 개체라 변이만 잡은 종은 기본 도감에서 여전히 ??? (v0.3.3)
  const viewForm: FormId = view === 'variant' ? 'variant' : 'normal';
  const data = useMemo(() => selectDexGrid(game, sub, viewForm), [game, sub, viewForm]);
  const [detail, setDetail] = useState<Fish | null>(null);

  return (
    <div>
      <h3 className="text-lg text-gold mb-1">
        {view === 'base' ? '일반 어종' : '돌연변이'}
        {' ('}<span className="pf-accent">
          {data.foundCount}/{data.fishCount}
        </span>{')'}
      </h3>
      <SubTabs
        items={data.zones.map(({ id, foundCount, fishCount }) => ({
          key: id,
          label: <>{zoneById(id)!.shortName}<span className="text-2xs"> {foundCount}/{fishCount}</span></>,
        }))}
        activeKey={sub}
        onSelect={onSub}
      />
      {data.spots.map(({ spot: s, fishes }) => {
        return (
          <div key={s.id} className="mt-2">
            <h4 className="text-sm text-text-dim font-normal border-b border-line pb-1 mb-1">{s.name}</h4>
            <div className="grid grid-cols-3 gap-2">
              {fishes.map(({ fish: f, discovered: ok, count, name, price }) => {
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게
                return (
                  <div key={f.id} data-rarity={f.rarity}
                       className={cx(RARITY_CARD, 'p-2 text-sm', !ok && 'opacity-[0.72]')}
                       role={ok ? 'button' : undefined} tabIndex={ok ? 0 : undefined}
                       onClick={ok ? () => setDetail(f) : undefined}>
                        <FishSprite fish={f} preset="icon" form={viewForm} discovered={ok}
                                    ariaLabel={ok ? name : '미확인 어종'}
                                className="block mx-auto mb-1" />
                    {ok ? (
                      <>
                        <b>{name}</b><br />
                        <RarityText rarity={f.rarity} /> · <span className="pf-accent">{price}G</span><br />
                        <span className="text-text-dim text-xs">
                          {count}마리 잡음
                        </span>
                      </>
                    ) : (
                      <>
                        <b>???</b><br />
                        <span className="text-text-dim text-xs"><RarityDot rarity={f.rarity} />미확인</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {detail && (
        <DexDetail key={`${detail.id}-${view}`} fish={detail} game={game}
                   initialForm={view === 'variant' ? 1 : 0} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
