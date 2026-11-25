import type { ReactNode } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { boatNameOf } from '../../../../game/content/boats';
import type { ReachableZone, StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import BoatSprite from '../../../ui/BoatSprite';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import ProgressMeter from '../../../ui/ProgressMeter';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import { StatValue } from './RodStatTable';

const BAG_TONE = { normal: 'gold', warn: 'orange', danger: 'danger' } as const;
const HEAD = 'h-[30px] px-2 font-normal border-b border-line';

// 배 탭: 배 그림과 이름, 이동 속도와 가방 용량, 가방 막대, 지역별로 열린 해역 수와 남은 해역을 여는 배.
export default function BoatTab({ game, summary, row, zones }: {
  game: GameState; summary: StatsSummary; row: StatsSpotRow; zones: ReachableZone[];
}) {
  const { bag } = summary;
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-3 min-h-12">
        {game.boat > 0 && <BoatSprite tier={game.boat} preset="hero" />}
        <b className="pf-accent text-base font-normal text-gold truncate">{boatNameOf(game.boat, '배 없음')}</b>
      </div>
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5">
        <ul className="flex flex-col text-xs">
          <BoatStatLine label="이동 속도"><StatValue label="이동 속도" stat={row.data.speed} unit="" digits={0} /></BoatStatLine>
          <BoatStatLine label="가방 용량"><StatValue label="가방 용량" stat={bag.capStat} unit="마리" digits={0} /></BoatStatLine>
        </ul>
        <div className="flex items-center gap-2.5 text-xs">
          <span className="text-text-dim shrink-0">가방</span>
          <ProgressMeter
            current={bag.count}
            target={bag.cap}
            ratio={bag.percent / 100}
            tone={BAG_TONE[bag.level]}
            ariaLabel="가방"
          />
          <span className="pf-accent shrink-0">{fmtNum(bag.count)} / {fmtNum(bag.cap)} <span className="text-text-dim">({bag.percent}%)</span></span>
        </div>
      </Inset>
      <TableBox className="flex-1 min-h-0 px-3 pb-2">
        <DataTable cols={[null, '110px', '140px']} nameMin="8rem">
          <thead>
            <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
              <th className={cx(HEAD, 'pl-0 text-left')}>갈 수 있는 곳</th>
              <th className={cx(HEAD, 'text-right')}>열린 해역</th>
              <th className={cx(HEAD, 'pr-0 text-right')}>필요한 배</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => {
              const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60');
              const closed = z.open === 0;
              return (
                <tr key={z.zone} className={cx(closed && 'text-text-dim')}>
                  <td className={cx(cell, 'truncate')}>{z.name}</td>
                  <td className={cx(cell, 'px-2 text-right pf-accent text-xs')}>{z.open}/{z.total}</td>
                  <td className={cx(cell, 'pl-2 text-right text-xs truncate', !closed && 'text-text-dim')}>
                    {z.nextBoat !== null && boatNameOf(z.nextBoat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </TableBox>
    </div>
  );
}

/** 배 수치 한 줄: 이름은 왼쪽(보조색), 값은 오른쪽 */
function BoatStatLine({ label, children }: { label: string; children: ReactNode }) {
  return <KeyValueRow as="li" compact className="text-sm" label={label} value={children} valueClassName="pf-accent" />;
}
