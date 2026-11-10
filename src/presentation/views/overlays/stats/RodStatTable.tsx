import type { ReactNode } from 'react';
import type { Stat } from '../../../../game/rules/stats';
import { POWER_RULES, autoPenaltyHelpText } from '../../../../game/rules/stats';
import type { StatsSpotRow, SpotFit } from '../../../../features/gameplay/model/stats';
import { cx } from '../../../ui/cx';
import Tip, { TipList } from '../../../ui/Tip';
import { FIT_LABEL, FIT_TONE, goodText, idleRows, idleText } from './statsText';

// 낚싯대 수치: 고른 해역 기준의 유효 스탯을 두 열 목록으로 보인다. 입질 대기와 방치 페널티는 해역 대비 상대치이고,
// 보정이 있으면 값의 툴팁으로 내역을 본다. 바 시간(sweep)만 레벨과 파워에 무관한 절대치다.
// 값은 스탯 선택자에서 오고 여기서 규칙을 재계산하지 않는다.

/** 보정 내역 문장. 보정이 없으면 null */
const modsText = (stat: Stat, unit: string, prefix = ''): string | null =>
  stat.mods.length > 0
    ? `기본 ${prefix}${stat.base.toFixed(1)}${unit}` +
      stat.mods.map(m => ` ${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}${unit} (${m.label})`).join('') +
      ` = ${prefix}${stat.value.toFixed(1)}${unit}`
    : null;

/** 값. 보정이 있으면 툴팁으로 보정 내역을 보인다 */
export function StatValue({ stat, unit, digits = 1, prefix = '' }: { stat: Stat; unit: string; digits?: number; prefix?: string }) {
  const value = `${prefix}${digits === 0 ? Math.round(stat.value) : stat.value.toFixed(digits)}${unit}`;
  const detail = modsText(stat, unit, prefix);
  return detail ? <Tip text={detail}>{value}</Tip> : <span>{value}</span>;
}

/** 해역 적합도: 충족(하늘), 파워 부족(위험), 배 필요(보조색)의 굵은 글자 */
export function FitText({ fit, className }: { fit: SpotFit; className?: string }) {
  return <span className={cx('text-xs font-bold whitespace-nowrap', FIT_TONE[fit], className)}>{FIT_LABEL[fit]}</span>;
}

const perfectText = (row: StatsSpotRow): string =>
  row.data.powerZones.red > 0 ? `${Math.round(row.data.powerZones.red)}%` : row.data.powerZones.yellow > 0 ? '-' : '요구 미달';

/** 한 줄: 이름은 왼쪽(보조색), 값은 오른쪽 */
function RodStatLine({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 h-[26px] text-xs [&+&]:border-t [&+&]:border-line/60">
      <span className="text-text-dim">{label}</span>
      <span className="pf-accent">{children}</span>
    </li>
  );
}

export default function RodStatTable({ row }: { row: StatsSpotRow }) {
  const { axes, effectiveBite, idle } = row.data;
  const idleDetail = idleRows(row);
  return (
    <div className="grid grid-cols-2 gap-x-5 mobile:grid-cols-1">
      <ul className="flex flex-col">
        <RodStatLine label="바 시간">{axes.sweep.value.toFixed(2)}초</RodStatLine>
        <RodStatLine label="입질 최소 대기"><StatValue stat={effectiveBite.min} unit="초" /></RodStatLine>
        <RodStatLine label="입질 최대 대기"><StatValue stat={effectiveBite.max} unit="초" /></RodStatLine>
        <RodStatLine label={<Tip text={'노란 영역이 바 폭에서 차지하는 크기예요.\n가운데 빨간 영역도 포함해요.\n요구 파워를 넘을수록 넓어져요.'}>GOOD 영역</Tip>}>
          {goodText(row)}
        </RodStatLine>
      </ul>
      <ul className="flex flex-col">
        <RodStatLine label={<Tip text={`가운데에 열리는 빨간 영역이에요.\n파워가 요구치보다 ${POWER_RULES.redMinExcess} 넘게 높으면 생겨요.`}>PERFECT 영역</Tip>}>
          {perfectText(row)}
        </RodStatLine>
        <RodStatLine label={<Tip text={autoPenaltyHelpText()}>방치 낚시 페널티</Tip>}>
          {idleDetail ? <Tip text={<TipList rows={idleDetail} />}>{idleText(idle)}</Tip> : <span>{idleText(idle)}</span>}
        </RodStatLine>
      </ul>
    </div>
  );
}
