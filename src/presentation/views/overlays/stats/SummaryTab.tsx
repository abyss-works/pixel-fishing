import type { GameState } from '../../../../game/rules/logic';
import type { StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import { fmtGold, fmtNum } from '../../../ui/format';
import PowerMeter from './PowerMeter';
import { FitTag } from './RodStatTable';
import { POWERED_NOTE, UNDERPOWERED_NOTE, goodText } from './statsText';

// 요약 탭 — 나·배·낚싯대 꼬리표, 명성·골드·도감·가방 타일, 고른 해역의 적합도와 핵심 수치 세 개.
export default function SummaryTab({ game, nickname, summary, row, here }: {
  game: GameState; nickname: string | null; summary: StatsSummary; row: StatsSpotRow;
  /** 사거리 안의 어군 수역이면 true — 아니면 지역의 기준 해역을 보여 준다 */
  here: boolean;
}) {
  const { bag } = summary;
  const { data } = row;
  return (
    <div className="flex flex-col gap-2 h-full">
      <Frame className="bg-surface-2 flex items-center gap-3 px-3 py-2">
        {game.boat > 0 && <BoatSprite tier={game.boat} preset="row" />}
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-base font-bold truncate">{nickname ?? '불러오는 중…'}</span>
          <span className="flex flex-wrap gap-1">
            <Badge>{data.boatName}</Badge><Badge>낚싯대 Lv.{game.rod}</Badge><Badge>파워 {data.currentPower}</Badge>
          </span>
        </div>
      </Frame>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile label="명성" value={fmtNum(game.fame)} />
        <KpiTile label="골드" value={fmtGold(game.gold)} />
        <KpiTile label="도감" value={`${summary.dexFound} / ${summary.dexTotal}`} hint="일반 폼으로 한 번이라도 낚은 어종" />
        <KpiTile label="가방" value={`${fmtNum(bag.count)} / ${fmtNum(bag.cap)}`} hint={`${bag.percent}% 찼어요`}
                 tone={bag.level === 'danger' ? 'danger' : 'gold'} />
      </div>
      <SectionTitle>{here ? '지금 있는 해역' : '이 지역 해역'}</SectionTitle>
      <Inset className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <b className="text-gold flex-1 truncate">{row.spot.name}</b>
          <FitTag fit={row.fit} />
        </div>
        <PowerMeter power={data.currentPower} requirement={data.requirement} />
        <div className="flex gap-3 text-xs text-text-dim">
          <span>입질 <b className="pf-accent text-text">{data.effectiveBite.min.value.toFixed(1)}~{data.effectiveBite.max.value.toFixed(1)}초</b></span>
          <span>GOOD <b className="pf-accent text-text">{goodText(row)}</b></span>
          <span>방치 <b className="pf-accent text-text">×{data.autoBoost.value.toFixed(1)}</b></span>
        </div>
      </Inset>
      {/* 조건부 렌더 대신 항상 렌더 — 해역이 바뀌어도 높이가 흔들리지 않는다 */}
      <Note size="xs" className="mt-auto mb-0">{data.underpowered ? UNDERPOWERED_NOTE : POWERED_NOTE}</Note>
    </div>
  );
}
