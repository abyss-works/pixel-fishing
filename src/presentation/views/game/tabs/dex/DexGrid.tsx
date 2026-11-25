import { useMemo, useState } from 'react';
import type { Fish, FormId, GameState } from '../../../../../game/rules/logic';
import { zoneById } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { selectDexGrid } from '../../../../../features/dex/model/catalog';
import { cx } from '../../../../ui/cx';
import Badge from '../../../../ui/Badge';
import Frame from '../../../../ui/Frame';
import PixelIcon from '../../../../ui/PixelIcon';
import SubTabs from '../../../../ui/SubTabs';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityDot, RARITY_CARD, DIM_CARD } from '../../../../ui/fish/RarityTag';
import PageTitle from '../../../../ui/PageTitle';
import Subheading from '../../../../ui/Subheading';
import { fmtGold } from '../../../../ui/format';
import type { DexView } from '../tabs';
import DexDetail from './DexDetail';

// 일반/돌연변이 공용 격자 — 폼별 발견 기준만 다르다. 변이는 별개 개체라 변이만 잡은 종은
// 기본 도감에서 여전히 ??? (v0.3.3)
export default function DexGrid({ game, view, sub, onSub }: {
  game: GameState;
  view: DexView;
  /** 열람 중인 최상위 존 — GameTabs 소유(탭을 떠났다 와도 유지) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  // 폼별 발견 기준 — 변이는 별개 개체라 변이만 잡은 종은 기본 도감에서 여전히 ??? (v0.3.3)
  const viewForm: FormId = view === 'variant' ? 'variant' : 'normal';
  const data = useMemo(() => selectDexGrid(game, sub, viewForm), [game, sub, viewForm]);
  const [detail, setDetail] = useState<Fish | null>(null);

  return (
    <div>
      <PageTitle className="mb-1">
        {view === 'base' ? '일반 어종' : '돌연변이'}
        {' ('}{data.foundCount}/{data.fishCount}{')'}
      </PageTitle>
      <SubTabs
        items={data.zones.map(({ id, foundCount, fishCount }) => ({
          key: id, label: zoneById(id)!.shortName, sub: `${foundCount}/${fishCount}`,
        }))}
        activeKey={sub}
        onSelect={onSub}
      />
      {data.spots.map(({ spot: s, normalProgress, fishes }) => {
        return (
          <div key={s.id} className="mt-2">
            <Subheading className="border-b border-line pb-1 flex items-center justify-between gap-2">
              <span>{s.name}</span>
              {view === 'base' && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={cx('pf-accent', normalProgress.completed ? 'text-gold' : 'text-text-dim')}>
                    {normalProgress.found}/{normalProgress.total}
                  </span>
                  {normalProgress.completed && (
                    <Badge tone="gold" size="xs" inline>
                      <PixelIcon glyph="check" size={10} />
                      완성
                    </Badge>
                  )}
                </span>
              )}
            </Subheading>
            <div className="grid grid-cols-3 gap-2">
              {fishes.map(({ fish: f, discovered: ok, count, name, price }) => {
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게
                const body = (
                  <>
                    <FishSprite fish={f} preset="icon" form={viewForm} discovered={ok}
                                ariaLabel={ok ? name : '미확인 어종'}
                                className="block mx-auto mb-1" />
                    {ok ? (
                      <>
                        <b>{name}</b><br />
                        <span className="pf-accent">{fmtGold(price)}</span><br />
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
                  </>
                );
                return ok ? (
                  <Frame as="button" type="button" key={f.id} data-rarity={f.rarity}
                         className={cx(RARITY_CARD, 'p-2 text-sm text-center cursor-pointer')}
                         onClick={() => setDetail(f)}>
                    {body}
                  </Frame>
                ) : (
                  <div key={f.id} data-rarity={f.rarity}
                       className={cx(RARITY_CARD, 'p-2 text-sm', DIM_CARD)}>
                    {body}
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
