import type { ReactNode } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import { cx } from '../../../ui/cx';
import { fmtGold, fmtNum, fmtRatio } from '../../../ui/format';
import Inset from '../../../ui/Inset';
import Tip from '../../../ui/Tip';
import PowerMeter from './PowerMeter';
import { FitText } from './RodStatTable';
import { POWERED_NOTE, UNDERPOWERED_NOTE, goodText } from './statsText';

// 요약 탭: 명성, 골드, 도감, 가방 네 칸과, 고른 해역의 칸(이름과 적합도, 파워 막대, 핵심 수치 셋).
// 파워 충족 안내는 적합도의 툴팁이다.
export default function SummaryTab({ game, summary, row, here }: {
  game: GameState; summary: StatsSummary; row: StatsSpotRow;
  /** 사거리 안의 어군 수역이면 true — 아니면 지역의 기준 해역을 보여 준다 */
  here: boolean;
}) {
  const { bag } = summary;
  const { data } = row;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2 max-[640px]:grid-cols-2">
        <StatsKpi label="명성" value={fmtNum(game.fame)} />
        <StatsKpi label="골드" value={fmtGold(game.gold)} />
        <StatsKpi label={<Tip text="일반 폼으로 한 번이라도 낚은 어종">도감</Tip>} value={fmtRatio(summary.dexFound, summary.dexTotal)} />
        <StatsKpi label="가방" value={fmtRatio(bag.count, bag.cap)} danger={bag.level === 'danger'} />
      </div>
      <Inset className="px-3 py-2.5 flex flex-col gap-2.5">
        <span className="text-2xs text-text-dim">{here ? '지금 있는 해역' : '이 지역 해역'}</span>
        <div className="flex items-baseline justify-between gap-2">
          <b className="text-gold truncate">{row.spot.name}</b>
          <Tip text={data.underpowered ? UNDERPOWERED_NOTE : POWERED_NOTE}><FitText fit={row.fit} /></Tip>
        </div>
        <PowerMeter power={data.currentPower} requirement={data.requirement} />
        <div className="grid grid-cols-3">
          <SummaryFigure label="입질 대기">{data.effectiveBite.min.value.toFixed(1)}~{data.effectiveBite.max.value.toFixed(1)}초</SummaryFigure>
          <SummaryFigure label="GOOD 영역">{goodText(row)}</SummaryFigure>
          <SummaryFigure label="방치 낚시">×{data.autoBoost.value.toFixed(1)}</SummaryFigure>
        </div>
      </Inset>
    </div>
  );
}

/** 요약 칸 하나: 이름(보조색) 아래 값(픽셀 글꼴, 골드). 가방이 거의 찼으면 위험색이다 */
function StatsKpi({ label, value, danger }: { label: ReactNode; value: string; danger?: boolean }) {
  return (
    <Inset className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span className="text-2xs text-text-dim">{label}</span>
      <span className={cx('pf-accent text-base truncate', danger ? 'text-danger' : 'text-gold')}>{value}</span>
    </Inset>
  );
}

/** 해역 칸의 핵심 수치 하나: 왼쪽 구분선과 이름, 값 */
function SummaryFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 pl-3 border-l border-line">
      <span className="text-2xs text-text-dim">{label}</span>
      <span className="pf-accent text-xs">{children}</span>
    </div>
  );
}
