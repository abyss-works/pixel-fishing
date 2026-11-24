import type { Stat } from '../../../game/rules/stats';

const fmtInt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

const fmtModNum = (n: number, digits: number): string =>
  digits === 0 && Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toFixed(digits === 0 ? 1 : digits);

/** 표시용 스탯 값 포맷 — digits가 0이면 반올림 정수에 천 단위 쉼표를 넣고, 그 밖에는 지정 자릿수로 고정한다 */
export function formatStatValue(value: number, unit: string, digits = 1, prefix = ''): string {
  const num = digits === 0 ? fmtInt(value) : value.toFixed(digits);
  return `${prefix}${num}${unit}`;
}

/** 스탯 툴팁 보정 내역 문장 — 보정이나 초과 유지(래칫)가 없으면 null */
export function formatStatMods(stat: Stat, unit: string, digits = 1, prefix = ''): string | null {
  const modSum = stat.mods.reduce((s, m) => s + m.delta, stat.base);
  const ratcheted = stat.value - modSum > 1e-6;
  if (stat.mods.length === 0 && !ratcheted) return null;
  const parts = [`기본 ${prefix}${fmtModNum(stat.base, digits)}${unit}`];
  for (const m of stat.mods) {
    parts.push(`${m.delta >= 0 ? '+' : ''}${fmtModNum(m.delta, digits)}${unit} (${m.label})`);
  }
  if (stat.mods.length > 0) parts.push(`= ${prefix}${fmtModNum(modSum, digits)}${unit}`);
  const body = parts.join(' ');
  return ratcheted ? `${body} (초과 보유 ${prefix}${fmtModNum(stat.value, digits)}${unit} 유지)` : body;
}
