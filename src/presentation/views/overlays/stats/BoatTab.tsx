import type { ReactNode } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { boatNameOf } from '../../../../game/content/boats';
import type { ReachableZone, StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import BoatSprite from '../../../ui/BoatSprite';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Inset from '../../../ui/Inset';
import { StatValue } from './RodStatTable';

const BAG_FILL = { normal: 'bg-gold', warn: 'bg-orange', danger: 'bg-danger' } as const;
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
        {game.boat > 0 && <span className="text-sm text-text-dim">({game.boat}단계)</span>}
      </div>
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5">
        <ul className="flex flex-col text-xs">
          <BoatStatLine label="이동 속도"><StatValue stat={row.data.speed} unit="" digits={0} /></BoatStatLine>
          <BoatStatLine label="가방 용량">{fmtNum(bag.cap)}마리</BoatStatLine>
        </ul>
        <div className="flex items-center gap-2.5 text-xs" role="meter" aria-label="가방"
             aria-valuemin={0} aria-valuemax={bag.cap} aria-valuenow={bag.count}>
          <span className="text-text-dim shrink-0">가방</span>
          <span className="flex-1 h-2 bg-bg border border-line shadow-[inset_1px_1px_0_var(--bevel-hi)]">
            <span className={cx('block h-full', BAG_FILL[bag.level])} style={{ width: `${Math.min(100, bag.percent)}%` }} />
          </span>
          <span className="pf-accent shrink-0">{fmtNum(bag.count)} / {fmtNum(bag.cap)} <span className="text-text-dim">({bag.percent}%)</span></span>
        </div>
      </Inset>
      <Inset className="pf-scroll-panel flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup><col /><col className="w-[110px]" /><col className="w-[140px]" /></colgroup>
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
                    {z.nextBoat !== null && `${boatNameOf(z.nextBoat)}(${z.nextBoat}단계)`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Inset>
    </div>
  );
}

/** 배 수치 한 줄: 이름은 왼쪽(보조색), 값은 오른쪽 */
function BoatStatLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 h-[26px] [&+&]:border-t [&+&]:border-line/60">
      <span className="text-text-dim">{label}</span>
      <span className="pf-accent">{children}</span>
    </li>
  );
}
