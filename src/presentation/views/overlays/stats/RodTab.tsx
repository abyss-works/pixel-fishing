import type { KeyboardEvent } from 'react';
import type { ZoneId } from '../../../../game/content/zones';
import { boatNameOf } from '../../../../game/content/boats';
import type { StatsSpotRow, StatsZoneTab } from '../../../../features/gameplay/model/stats';
import BoatSprite from '../../../ui/BoatSprite';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import SubTabs from '../../../ui/SubTabs';
import PowerMeter from './PowerMeter';
import RodStatTable, { FitText } from './RodStatTable';

const HEAD = 'h-[30px] px-2 font-normal border-b border-line';

// 낚싯대 탭: 지역 서브탭과 해역 표(해역, 요구 파워, 적합)에서 해역을 고르면 그 해역 기준의 파워 막대와 낚싯대 수치가 아래에 뜬다.
// 해역 표는 표 머리와 세 줄 높이로 고정하고 넘치면 그 안에서 굴린다. 낚싯대 레벨과 파워는 창의 고정 정보 줄에 있다.
export default function RodTab({ rows, zoneTabs, zone, selected, onZone, onSelect }: {
  rows: StatsSpotRow[]; zoneTabs: StatsZoneTab[];
  zone: ZoneId; selected: StatsSpotRow;
  onZone: (zone: ZoneId) => void; onSelect: (spotIndex: number) => void;
}) {
  const inZone = rows.filter(row => row.zone === zone);
  const onKey = (e: KeyboardEvent, spotIndex: number) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onSelect(spotIndex);
  };
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <SubTabs items={zoneTabs.map(tab => ({ key: tab.zone, label: tab.name, sub: `${tab.ok}/${tab.total} 충족` }))}
               activeKey={zone} onSelect={onZone} />
      <TableBox className="h-[140px] min-h-16 shrink px-3 pb-2">
        <DataTable cols={[null, '90px', '90px']} nameMin="8rem" aria-label="해역">
          <thead>
            <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
              <th className={cx(HEAD, 'pl-0 text-left')}>해역</th>
              <th className={cx(HEAD, 'text-right')}>요구 파워</th>
              <th className={cx(HEAD, 'pr-0 text-right')}>적합</th>
            </tr>
          </thead>
          <tbody>
            {inZone.map((row, i) => {
              const on = row.spotIndex === selected.spotIndex;
              const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60', on && 'bg-gold/[0.07]');
              return (
                <tr key={row.spotIndex} tabIndex={0} aria-selected={on}
                    onClick={() => onSelect(row.spotIndex)} onKeyDown={e => onKey(e, row.spotIndex)}
                    className={cx('cursor-pointer hover:bg-surface-2/50 focus-visible:outline-1 focus-visible:outline-gold', on && 'text-gold')}>
                  <td className={cx(cell, 'truncate')}>{row.spot.name}</td>
                  <td className={cx(cell, 'px-2 text-right pf-accent text-xs')}>{row.spot.powerReq ?? 0}</td>
                  <td className={cx(cell, 'text-right')}><FitText fit={row.fit} /></td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </TableBox>
      <Inset className="px-3 py-2.5 flex flex-col gap-2.5">
        {selected.fit === 'boat' ? (
          <div className="h-[130px] flex flex-col items-center justify-center gap-2 text-center">
            <BoatSprite tier={selected.spot.boatTier} preset="row" />
            <span className="text-sm">{selected.spot.name}</span>
            <Note size="xs" className="my-0">
              {boatNameOf(selected.spot.boatTier)}({selected.spot.boatTier}단계)가 있어야 갈 수 있어요.
            </Note>
          </div>
        ) : (
          <>
            <PowerMeter power={selected.data.currentPower} requirement={selected.data.requirement} />
            <RodStatTable row={selected} />
          </>
        )}
      </Inset>
    </div>
  );
}
