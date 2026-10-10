import { formDiscovered } from '../../game/logic';
import type { GameState } from '../../game/logic';
import { ZONE_IDS, zoneById } from '../../data/zones';
import type { ZoneId } from '../../data/zones';
import { BOUNTIES } from '../../data/bounties';
import type { BountyQuest } from '../../data/bounties';
import { namedById, namedFishOf } from '../../data/named';
import { cx } from '../../ui/cx';
import SubTabs from '../../ui/SubTabs';
import FishSprite from '../../ui/FishSprite';
import { RARITY_CARD } from '../shared';

// 도감 지명수배 화면 — 네임드는 해역별 1칸. 수배 목록에서만 공개된 히든 어종이라
// FISH 행이 없을 수 있다. 발견 여부는 도감 기록(records) 기준이라 어종 데이터가
// 나중에 와도 소급된다.
export default function DexNamedView({ game, sub, onSub }: {
  game: GameState;
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  const namedOf = (zone: ZoneId): BountyQuest[] =>
    BOUNTIES.filter(q => q.zone === zone && q.difficulty === 'named');
  const namedFound = (q: BountyQuest): boolean =>
    q.targetFish !== null && formDiscovered(game, q.targetFish, 'normal');
  const namedCount = BOUNTIES.filter(q => q.difficulty === 'named' && namedFound(q)).length;
  const namedTotal = BOUNTIES.filter(q => q.difficulty === 'named').length;

  return (
    <div>
      <h3 className="text-lg text-gold mb-1">
        지명 수배
        {' ('}<span className="pf-accent">{namedCount}/{namedTotal}</span>{')'}
      </h3>
      <SubTabs
        items={ZONE_IDS.map(id => {
          const quests = namedOf(id);
          const caught = quests.filter(namedFound).length;
          return {
            key: id,
            label: <>{zoneById(id)!.shortName}<span className="text-2xs"> {caught}/{quests.length}</span></>,
          };
        })}
        activeKey={sub}
        onSelect={onSub}
      />
      {/* 네임드는 해역별 1칸 — 너비 꽉 채우는 정사각형 대형 카드 1장 */}
      <div className="flex flex-col gap-2 mt-2">
        {namedOf(sub).map(q => {
          const ok = namedFound(q);
          const n = q.targetFish ? namedById(q.targetFish) : undefined;
          const fish = n ? namedFishOf(n) : null;
          const name = ok && n ? n.name : (ok ? q.targetFish : null);
          return (
            <div key={q.id} className={cx(RARITY_CARD, 'p-4 w-full aspect-square flex flex-col items-center justify-center', !ok && 'opacity-[0.72]')}>
              {fish && (
                <FishSprite fish={fish} preset="portrait" discovered={ok}
                            ariaLabel={ok && n ? n.name : '미확인 지명수배'} className="block mx-auto" />
              )}
              <b className="block mt-1 text-center">{ok ? (name ?? q.targetFish) : '???'}</b>
              <span className="block text-center text-text-dim text-xs">
                {ok ? '수배 달성' : '미확인'}
              </span>
            </div>
          );
        })}
        {namedOf(sub).length === 0 && (
          <p className="text-text-dim text-sm">이 해역의 지명 수배는 아직 없다.</p>
        )}
      </div>
    </div>
  );
}
