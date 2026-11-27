import type { ReactNode } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { StatsSpotRow, StatsSummary } from '../../../../features/gameplay/model/stats';
import { fmtGold, fmtNum, fmtRatio } from '../../../ui/format';
import Badge from '../../../ui/Badge';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Tip, { TipCard } from '../../../ui/Tip';
import PowerMeter from './PowerMeter';
import { FitText } from './RodStatTable';
import { FIT_LABEL, POWERED_NOTE, goodText, idleText } from './statsText';

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
      <div className="grid grid-cols-4 gap-2 mobile:grid-cols-2">
        <KpiTile size="sm" label="명성" value={fmtNum(game.fame)} />
        <KpiTile size="sm" label="골드" value={fmtGold(game.gold)} />
        <KpiTile size="sm" label={<Tip text="한 번이라도 낚은 일반 어종">도감</Tip>} value={fmtRatio(summary.dexFound, summary.dexTotal)} />
        <KpiTile size="sm" label="가방" value={fmtRatio(bag.count, bag.cap)} tone={bag.level === 'danger' ? 'danger' : 'gold'} />
      </div>
      <Inset className="px-3 py-2.5 flex flex-col gap-2.5">
        <span className="text-2xs text-text-dim">{here ? '지금 있는 해역' : '이 지역 해역'}</span>
        <div className="flex items-baseline justify-between gap-2">
          <b className="text-gold truncate">{row.spot.name}</b>
          <Tip text={(
            <TipCard
              title={row.spot.name}
              badge={<Badge tone="dim-plain" size="2xs">{FIT_LABEL[row.fit]}</Badge>}
              description={data.underpowered ? undefined : POWERED_NOTE}
              bullets={data.underpowered
                ? ['GOOD과 PERFECT 영역이 사라지고 희귀한 물고기가 덜 걸려요.', '입질도 늦어져요.']
                : undefined}
              status={data.underpowered
                ? {
                  tone: 'warn',
                  lines: [
                    `필요 파워 ${data.requirement} (현재 ${data.currentPower})`,
                    '집 작업대나 항구 공방에서 강화해 주세요.',
                  ],
                }
                : undefined}
            />
          )}>
            <FitText fit={row.fit} />
          </Tip>
        </div>
        <PowerMeter power={data.currentPower} requirement={data.requirement} />
        {data.underpowered && (
          <p className="text-2xs text-orange leading-snug whitespace-pre-line">
            {`필요 파워(${data.requirement})보다 낮아요.\nGOOD과 PERFECT 영역이 사라지고 희귀한 물고기가 덜 걸리며 입질이 늦어져요.`}
          </p>
        )}
        <div className="grid grid-cols-3">
          <SummaryFigure label="입질 대기">{data.effectiveBite.min.value.toFixed(1)}~{data.effectiveBite.max.value.toFixed(1)}초</SummaryFigure>
          <SummaryFigure label="GOOD 영역">{goodText(row)}</SummaryFigure>
          <SummaryFigure label="방치 낚시">{idleText(data.idle)}</SummaryFigure>
        </div>
      </Inset>
    </div>
  );
}

/** 해역 칸의 핵심 수치 하나: 둘째 칸부터 왼쪽에 구분선을 긋는다 */
function SummaryFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 pl-3 border-l border-line first:pl-0 first:border-l-0">
      <span className="text-2xs text-text-dim">{label}</span>
      <span className="pf-accent text-xs">{children}</span>
    </div>
  );
}
