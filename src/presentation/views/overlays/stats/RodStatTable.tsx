import type { Stat } from '../../../../game/rules/stats';
import { POWER_RULES, autoPenaltyHelpText } from '../../../../game/rules/stats';
import { MANUAL_POWER_BONUS } from '../../../../game/rules/power';
import type { StatsSpotRow, SpotFit } from '../../../../features/gameplay/model/stats';
import DataTable from '../../../ui/DataTable';
import HelpHint from '../../../ui/HelpHint';
import { cx } from '../../../ui/cx';
import { FIT_LABEL, goodText } from './statsText';

// 낚싯대 표 — 고른 해역 기준의 유효 스탯. 입질 대기·방치 페널티는 해역 대비 상대치이고 호버로 ±내역을 본다.
// 바 시간(sweep)만 레벨·파워와 무관한 절대치다. 값은 스탯 선택자에서 오고 여기서 규칙을 재계산하지 않는다.

/** 값과 보정 내역 도움말 — 보정이 없으면 도움말을 달지 않는다 */
export function StatValue({ stat, unit, digits = 1 }: { stat: Stat; unit: string; digits?: number }) {
  const detail = stat.mods.length > 0
    ? `기본 ${stat.base.toFixed(1)}${unit}` +
      stat.mods.map(m => ` ${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}${unit} (${m.label})`).join('') +
      ` = ${stat.value.toFixed(1)}${unit}`
    : undefined;
  return (
    <span>
      {digits === 0 ? Math.round(stat.value) : stat.value.toFixed(digits)}{unit}
      {detail && <HelpHint text={detail} />}
    </span>
  );
}

const perfectText = (row: StatsSpotRow): string =>
  row.data.powerZones.red > 0 ? `${Math.round(row.data.powerZones.red)}%` : row.data.powerZones.yellow > 0 ? '-' : '요구 미달';

const FIT_TONE: Record<SpotFit, string> = {
  ok: 'border-accent text-accent', power: 'border-danger text-danger', boat: 'border-line text-text-dim',
};

/** 해역 적합도 꼬리표 — 충족(하늘)·파워 부족(위험)·배 필요(보조색) */
export function FitTag({ fit, className }: { fit: SpotFit; className?: string }) {
  return (
    <span className={cx('text-xs px-1.5 py-0.5 rounded-sm border text-center shrink-0', FIT_TONE[fit], className)}>
      {FIT_LABEL[fit]}
    </span>
  );
}

export default function RodStatTable({ row }: { row: StatsSpotRow }) {
  const { axes, effectiveBite, manualBonus, autoBoost } = row.data;
  return (
    // table-fixed — 값 폭('요구 미달'↔'45%' 등)에 따라 열이 흔들리지 않게 열비를 고정한다
    <DataTable className="table-fixed w-full">
      <colgroup><col className="w-[42%]" /><col /></colgroup>
      <tbody>
        <tr><th scope="row">바 시간</th><td>{axes.sweep.value.toFixed(2)}초</td></tr>
        <tr><th scope="row">입질 최소 대기</th><td><StatValue stat={effectiveBite.min} unit="초" /></td></tr>
        <tr><th scope="row">입질 최대 대기</th><td><StatValue stat={effectiveBite.max} unit="초" /></td></tr>
        <tr>
          <th scope="row">
            GOOD 영역
            <HelpHint text="노란 영역이 바 폭에서 차지하는 크기예요. 가운데 빨간 영역도 포함해요. 요구 파워를 넘을수록 넓어져요." />
          </th>
          <td>{goodText(row)}</td>
        </tr>
        <tr>
          <th scope="row">
            PERFECT 영역
            <HelpHint text={`가운데에 열리는 빨간 영역이에요. 파워가 요구치보다 ${POWER_RULES.redMinExcess} 넘게 높으면 생겨요.`} />
          </th>
          <td>{perfectText(row)}</td>
        </tr>
        <tr>
          <th scope="row">
            수동 확률 보정
            <HelpHint text={`해역 요구 파워를 넘을수록 직접 낚을 때 희귀한 물고기가 더 잘 걸려요. 초과 ${MANUAL_POWER_BONUS.step}마다 ×${MANUAL_POWER_BONUS.perStep}씩, 최대 ×${MANUAL_POWER_BONUS.max.toFixed(1)}까지 올라요.`} />
          </th>
          <td>×{manualBonus.value.toFixed(1)}</td>
        </tr>
        <tr>
          <th scope="row">
            방치 낚시 페널티
            <HelpHint text={autoPenaltyHelpText()} />
          </th>
          <td>
            ×{autoBoost.value.toFixed(1)}
            {autoBoost.mods.length > 0 && (
              <HelpHint text={`기본 ×${autoBoost.base.toFixed(1)} ${autoBoost.mods.map(m => `${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)} (${m.label})`).join(' ')} = ×${autoBoost.value.toFixed(1)}`} />
            )}
          </td>
        </tr>
      </tbody>
    </DataTable>
  );
}
