import { useMemo } from 'react';
import type { GameState } from '../../../../../game/rules/logic';
import { zoneById } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { selectNamedDex } from '../../../../../features/dex/model/catalog';
import { cx } from '../../../../ui/cx';
import SubTabs from '../../../../ui/SubTabs';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RARITY_CARD } from '../../../../ui/fish/RarityTag';

// 도감 지명수배 화면 — 네임드는 해역별 1칸. 수배 목록에서만 공개된 히든 어종이라
// FISH 행이 없을 수 있다. 발견 여부는 도감 기록(records) 기준이라 어종 데이터가
// 나중에 와도 소급된다.
export default function DexNamedView({ game, sub, onSub }: {
  game: GameState;
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  const data = useMemo(() => selectNamedDex(game, sub), [game, sub]);

  return (
    <div>
      <h3 className="text-lg text-gold mb-1">
        지명 수배
        {' ('}<span className="pf-accent">{data.foundCount}/{data.totalCount}</span>{')'}
      </h3>
      <SubTabs
        items={data.zones.map(({ id, foundCount, totalCount }) => ({
          key: id,
          label: <>{zoneById(id)!.shortName}<span className="text-2xs"> {foundCount}/{totalCount}</span></>,
        }))}
        activeKey={sub}
        onSelect={onSub}
      />
      {/* 네임드는 해역별 1칸 — 너비 꽉 채우는 정사각형 대형 카드 1장 */}
      <div className="flex flex-col gap-2 mt-2">
        {data.quests.map(({ quest: q, found: ok, fish, displayName }) => {
          return (
            <div key={q.id} className={cx(RARITY_CARD, 'p-4 w-full aspect-square flex flex-col items-center justify-center', !ok && 'opacity-[0.72]')}>
              {fish && (
                <FishSprite fish={fish} preset="portrait" discovered={ok}
                            ariaLabel={ok && displayName ? displayName : '미확인 지명수배'} className="block mx-auto" />
              )}
              <b className="block mt-1 text-center">{ok ? (displayName ?? q.targetFish) : '???'}</b>
              <span className="block text-center text-text-dim text-xs">
                {ok ? '수배 달성' : '미확인'}
              </span>
            </div>
          );
        })}
        {data.quests.length === 0 && (
          <p className="text-text-dim text-sm">이 해역의 지명 수배는 아직 없다.</p>
        )}
      </div>
    </div>
  );
}
