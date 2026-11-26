// 효과 표기 가드 - 보너스 효과는 +N%/−N%, 기본 규칙 배수는 N배로 쓰고, 화면의 숫자는 실제 적용값과 같다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { selectStatsSpotRows } from '../../features/gameplay/model/stats';
import { commonWeightMultiplier } from '../../game/rules/actions';
import { newState } from '../../game/rules/logic';
import type { GameState } from '../../game/rules/logic';
import { fmtMult } from './format';
import RodStatTable from '../views/overlays/stats/RodStatTable';
import SummaryTab from '../views/overlays/stats/SummaryTab';

const game = (over: Partial<GameState>): GameState => ({ ...newState(), ...over });
const rowOf = (g: GameState, id: string) => selectStatsSpotRows(g, 'sail').find(r => r.spot.id === id)!;
const summaryOf = () => ({ dexFound: 0, dexTotal: 1, bag: { count: 0, cap: 10, level: 'ok' } }) as never;

const sources = Object.entries(import.meta.glob('../../{presentation,features}/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>).filter(([key]) => !/\.test\.tsx?$/.test(key) && !/\/admin\//.test(key)); // 관리자 화면은 플레이어에게 보이지 않는다

describe('효과 표기 가드', () => {
  afterEach(cleanup);

  it('기본 규칙 스탯 배수를 ×N 또는 xN으로 쓰지 않는다 - 기본 규칙 배수는 N배다(운세·비약·증폭·억제의 ×1.xx/×0.5 곱연산과 개수 ×{count}는 대상이 아니다)', () => {
    // 기본 규칙 배수(idle, penalty, applied, ratio, factor, rate 등)를 × 바로 뒤에 붙이는 표기, 소문자 x 배수 표기 전체, prefix="×", ×/x숫자배
    const STAT_MULT = /prefix="×"|(?<![\w])×\s*\$?\{[^}]*(?:[Ii]dle|[Pp]enalty|applied|[Rr]atio|[Ff]actor|[Rr]ate)[^}]*\}|(?<![\w])x\s*\$?\{[^}]*(?:toFixed|[Mm]ult|[Bb]oost|[Ii]dle|[Pp]enalty|applied|[Rr]atio|[Ff]actor|[Rr]ate)[^}]*\}|[×x]\s*\d+(?:\.\d+)?\s*배/;
    for (const bad of ['prefix="×"', '`×${idleMult}`', '`×${catchRatio}`', '`×${powerFactor}`', '`×${dropRate}`', '`x${mult.toFixed(2)}`', '`x${boost}`', '`x${rate}`', '×1.5배', 'x2배']) {
      expect(STAT_MULT.test(bad), bad).toBe(true);
    }
    for (const ok of ['`×${Number(mult.toFixed(4))}`', '×{count}', '0x1a']) {
      expect(STAT_MULT.test(ok), ok).toBe(false);
    }
    const offenders = sources.filter(([, src]) => STAT_MULT.test(src)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('방치 낚시 배수는 부족한 해역에서도 충분한 해역에서도 commonWeightMultiplier의 적용값과 같다', () => {
    for (const [g, id] of [[game({ boat: 5, rod: 3 }), 'sea'], [game({ boat: 5, rod: 18 }), 'sea']] as const) {
      const row = rowOf(g, id);
      const total = commonWeightMultiplier('auto', row.data.currentPower, id, row.data.powerZones.mult).total;
      cleanup();
      render(<RodStatTable row={row} />);
      expect(screen.getByText(fmtMult(total))).toBeTruthy();
      cleanup();
      render(<SummaryTab game={g} summary={summaryOf()} row={row} here />);
      expect(screen.getByText(fmtMult(total))).toBeTruthy();
    }
  });
});
