import type { GameState } from '../../../../game/rules/logic';
import { powerHelpText } from '../../../../game/rules/stats';
import type { ZoneId } from '../../../../game/content/zones';
import { boatNameOf } from '../../../../game/content/boats';
import type { StatsSpotRow, StatsZoneTab } from '../../../../features/gameplay/model/stats';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import GearSprite from '../../../ui/GearSprite';
import HelpHint from '../../../ui/HelpHint';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import SelectList from '../../../ui/SelectList';
import SubTabs from '../../../ui/SubTabs';
import PowerMeter from './PowerMeter';
import RodStatTable, { FitTag } from './RodStatTable';

// 낚싯대 탭 — 지역 서브탭과 해역 목록에서 해역을 고르면 그 해역 기준의 파워 막대와 낚싯대 표가 아래에 뜬다.
// 해역 목록은 높이를 고정하고 넘치면 그 안에서 굴린다. 상세는 남은 높이를 채운다.
export default function RodTab({ game, rows, zoneTabs, zone, selected, onZone, onSelect }: {
  game: GameState; rows: StatsSpotRow[]; zoneTabs: StatsZoneTab[];
  zone: ZoneId; selected: StatsSpotRow;
  onZone: (zone: ZoneId) => void; onSelect: (spotIndex: number) => void;
}) {
  const inZone = rows.filter(row => row.zone === zone);
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-3 px-1">
        <GearSprite kind="rod" preset="row" />
        <span className="pf-accent text-lg text-gold">Lv.{game.rod}</span>
        <Badge>파워 {selected.data.currentPower}</Badge>
        <span className="ml-auto"><HelpHint text={powerHelpText()} /></span>
      </div>
      <SubTabs items={zoneTabs.map(tab => ({ key: tab.zone, label: tab.name, sub: `${tab.ok}/${tab.total} 충족` }))}
               activeKey={zone} onSelect={onZone} />
      <div className="h-[120px] shrink-0 overflow-y-auto pf-scroll-panel">
        <SelectList label="해역" items={inZone} keyOf={row => String(row.spotIndex)}
                    selectedKey={String(selected.spotIndex)} onSelect={key => onSelect(Number(key))}
                    renderItem={row => (
                      <>
                        <span className="flex-1 truncate text-sm">{row.spot.name}</span>
                        <span className="pf-accent text-xs text-text-dim">파워 {row.spot.powerReq ?? 0}</span>
                        <FitTag fit={row.fit} className="w-[58px]" />
                      </>
                    )} />
      </div>
      <div className="flex-1 min-h-0">
        {selected.fit === 'boat' ? (
          <Inset className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
            <BoatSprite tier={selected.spot.boatTier} preset="row" />
            <span className="text-sm">{selected.spot.name}</span>
            <Note size="xs" className="my-0">
              {boatNameOf(selected.spot.boatTier)}({selected.spot.boatTier}단계)가 있어야 갈 수 있어요.
            </Note>
          </Inset>
        ) : (
          <div className="flex flex-col gap-1">
            <PowerMeter power={selected.data.currentPower} requirement={selected.data.requirement} className="px-1" />
            <RodStatTable row={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
