import { useMemo, useState } from 'react';
import type { BountyQuest } from '../../../../../game/content/bounties';
import type { GameState } from '../../../../../game/rules/logic';
import { zoneById } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { selectNamedDex } from '../../../../../features/dex/model/catalog';
import { cx } from '../../../../ui/cx';
import SubTabs from '../../../../ui/SubTabs';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RARITY_CARD, DIM_CARD } from '../../../../ui/fish/RarityTag';
import PageTitle from '../../../../ui/PageTitle';
import Note from '../../../../ui/Note';
import NamedDetail from './NamedDetail';

// 도감 네임드 화면 — 네임드는 구역별 1칸. 수배가 없는 존(마을)은 서브탭에 두지 않는다.
// 수배 목록에서만 공개된 히든 어종이라
// FISH 행이 없을 수 있다. 발견 여부는 도감 기록(records) 기준이라 어종 데이터가
// 나중에 와도 소급된다.
export default function DexNamedView({ game, sub, onSub }: {
  game: GameState;
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  const data = useMemo(() => selectNamedDex(game, sub), [game, sub]);
  const [detail, setDetail] = useState<BountyQuest | null>(null);

  return (
    <div>
      <PageTitle className="mb-1">
        네임드 ({data.foundCount}/{data.totalCount})
      </PageTitle>
      <SubTabs
        items={data.zones.map(({ id, foundCount, totalCount }) => ({
          key: id, label: zoneById(id)!.shortName, sub: `${foundCount}/${totalCount}`,
        }))}
        activeKey={data.zone}
        onSelect={onSub}
      />
      {/* 네임드는 해역별 1칸 — 너비 꽉 채우는 정사각형 대형 카드 1장 */}
      <div className="flex flex-col gap-2 mt-2">
        {data.quests.map(({ quest: q, found: ok, fish, displayName }) => {
          return (
            <div key={q.id} role="button" tabIndex={0} aria-label={`${ok ? (displayName ?? q.targetFish) : '미확인 네임드'} 상세 보기`}
                 onClick={() => setDetail(q)}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(q); } }}
                 className={cx(RARITY_CARD, 'p-4 w-full aspect-square flex flex-col items-center justify-center cursor-pointer hover:brightness-110', !ok && DIM_CARD)}>
              {fish && (
                <FishSprite fish={fish} preset="portrait" discovered={ok}
                            ariaLabel={ok && displayName ? displayName : '미확인 네임드'} className="block mx-auto" />
              )}
              <b className="block mt-1 text-center">{ok ? (displayName ?? q.targetFish) : '???'}</b>
              <span className="block text-center text-text-dim text-xs">
                {ok ? '수배 달성' : '미확인'}
              </span>
            </div>
          );
        })}
        {data.quests.length === 0 && (
          <Note className="my-0">이 구역의 네임드는 아직 없다.</Note>
        )}
      </div>
      {detail && <NamedDetail quest={detail} game={game} onClose={() => setDetail(null)} />}
    </div>
  );
}
