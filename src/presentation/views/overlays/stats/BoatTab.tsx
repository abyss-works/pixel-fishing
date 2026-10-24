import type { GameState } from '../../../../game/rules/logic';
import type { Movement } from '../../../../game/rules/stats';
import { boatNameOf } from '../../../../game/content/boats';
import type { ReachableZone, StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import PixelIcon from '../../../ui/PixelIcon';
import SectionTitle from '../../../ui/SectionTitle';
import StatCompare from '../../../ui/StatCompare';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import { StatValue } from './RodStatTable';

const BAG_FILL = { normal: 'bg-gold', warn: 'bg-orange', danger: 'bg-danger' } as const;
const BAG_CELLS = 10;

// 배 탭 — 큰 배 그림, 이동 속도·가방 용량, 가방 칸 게이지, 지역별로 갈 수 있는지.
export default function BoatTab({ game, movement, summary, row, zones }: {
  game: GameState; movement: Movement; summary: StatsSummary; row: StatsSpotRow; zones: ReachableZone[];
}) {
  const { bag } = summary;
  const filled = Math.floor(bag.percent / BAG_CELLS);
  return (
    <div className="flex flex-col gap-2 h-full">
      <Frame className="bg-surface-2 flex items-center gap-4 px-3 py-3 min-h-[74px]">
        {game.boat > 0 && <BoatSprite tier={game.boat} preset="hero" />}
        <div className="min-w-0 flex flex-col gap-1.5">
          <div className="text-gold pf-accent text-xl truncate">{boatNameOf(game.boat, '배 없음')}</div>
          <div className="flex flex-wrap gap-1">
            {game.boat > 0 && <Badge>{game.boat}단계</Badge>}
            <Badge>{movement === 'walk' ? '걷는 중' : '항해 중'}</Badge>
          </div>
        </div>
      </Frame>
      <StatCompare size="lg" rows={[
        { label: '이동 속도', value: <StatValue stat={row.data.speed} unit="" digits={0} /> },
        { label: '가방 용량', value: `${fmtNum(bag.cap)}마리` },
      ]} />
      <Inset className="px-3 py-2 flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs text-text-dim">
          <span>가방</span>
          <span className="pf-accent text-text">{fmtNum(bag.count)} / {fmtNum(bag.cap)} ({bag.percent}%)</span>
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: BAG_CELLS }, (_, i) => (
            <span key={i} className={cx('flex-1 h-3 border border-line', i < filled && BAG_FILL[bag.level])} />
          ))}
        </span>
      </Inset>
      <SectionTitle>갈 수 있는 곳</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {zones.map(z => z.needBoat === null ? (
          <span key={z.zone} className="text-xs px-2 py-1 rounded-sm border border-line text-text">
            {z.name}{z.open < z.total && <span className="text-text-dim"> {z.open}/{z.total}</span>}
          </span>
        ) : (
          <span key={z.zone} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm border border-line text-text-dim">
            <PixelIcon glyph="lock" size={10} />{z.name} · {boatNameOf(z.needBoat)}
          </span>
        ))}
      </div>
    </div>
  );
}
