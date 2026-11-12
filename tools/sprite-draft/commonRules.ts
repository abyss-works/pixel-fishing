// 공통 규칙 검사 — SPRITES.md 1.2의 연결성 규칙과 대상별 안전 여백을 격자 하나에 적용한다.
// 모든 대상의 산출물에 같은 검사를 쓰고, 대상마다 다른 값은 안전 여백뿐이다.
import { TRANSPARENT } from '../../src/game/content/sprites/types';

export type RuleName = 'diagonal' | 'floating' | 'margin';
export interface Violation { rule: RuleName; x: number; y: number }

/**
 * 인덱스 격자의 위반 목록.
 * - diagonal: 두 불투명 셀이 대각선으로만 닿는다(공유하는 상하 또는 좌우 두 칸이 모두 비었다). 왼쪽 셀의 좌표를 낸다.
 * - floating: 8방향 어디에도 불투명 이웃이 없는 단독 셀.
 * - margin: 안전 여백 안쪽 영역 밖의 불투명 셀.
 */
export function checkRows(rows: readonly string[], margin: number): Violation[] {
  const h = rows.length, w = rows[0]?.length ?? 0;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== TRANSPARENT;
  const out: Violation[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue;
      if (x < margin || y < margin || x > w - 1 - margin || y > h - 1 - margin) out.push({ rule: 'margin', x, y });
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && op(x + dx, y + dy)) neighbors++;
      if (neighbors === 0) out.push({ rule: 'floating', x, y });
      for (const dy of [1, -1]) {
        if (op(x + 1, y + dy) && !op(x + 1, y) && !op(x, y + dy)) out.push({ rule: 'diagonal', x, y });
      }
    }
  }
  return out;
}
