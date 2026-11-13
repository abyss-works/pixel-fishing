import { describe, expect, it } from 'vitest';
import { BAIT_SPRITES_GENERATED } from '../../src/game/content/sprites/baitSprites.generated';
import { BOAT_SPRITES } from '../../src/game/content/sprites/boatSprites.generated';
import { DISH_SPRITES_GENERATED } from '../../src/game/content/sprites/dishSprites.generated';
import { FISH_SHAPE_SPRITES } from '../../src/game/content/sprites/fishShapes.generated';
import { FISH_SPRITES_GENERATED } from '../../src/game/content/sprites/fishSprites.generated';
import { FISH_SPRITES } from '../../src/game/content/sprites/fishSprites';
import { ROD_SPRITE } from '../../src/game/content/sprites/gearSprites.generated';
import { SPRITE_KINDS, SPRITE_TARGETS } from '../../src/game/content/sprites/targets';
import type { SpriteKind } from '../../src/game/content/sprites/targets';
import type { PixelSprite } from '../../src/game/content/sprites/types';
import { checkRows } from './commonRules';
import type { RuleName } from './commonRules';

/** 키에 접두어를 붙여 서로 다른 저장소의 키가 겹치지 않게 한다 */
function tagged(prefix: string, sprites: Readonly<Record<string, PixelSprite | undefined>>): Record<string, PixelSprite> {
  const out: Record<string, PixelSprite> = {};
  for (const [k, v] of Object.entries(sprites)) if (v) out[`${prefix}${k}`] = v;
  return out;
}

/**
 * 대상별로 코드에 들어 있는 모든 격자. 대상 종류를 더하면 이 표에 행을 더해야 컴파일된다.
 * 유물은 격자가 미정이라 아직 격자가 없다.
 */
const GRIDS: Record<SpriteKind, Record<string, PixelSprite>> = {
  fish: { ...tagged('', FISH_SPRITES_GENERATED), ...tagged('hand:', FISH_SPRITES), ...tagged('shape:', FISH_SHAPE_SPRITES) },
  boat: tagged('tier', BOAT_SPRITES),
  gear: { rod: ROD_SPRITE },
  dish: tagged('', DISH_SPRITES_GENERATED),
  bait: tagged('', BAIT_SPRITES_GENERATED),
  artifact: {},
};

/** 기존 격자의 규칙 위반 예외. 격자를 고치는 작업과 따로 다루므로 위치와 이유를 적어 둔다. 고치면 이 항목을 지운다. */
interface Exception { kind: SpriteKind; key: string; rule: RuleName; cells: [number, number][]; reason: string }
const EXCEPTIONS: Exception[] = [
  { kind: 'fish', key: 'kraken', rule: 'diagonal', cells: [[18, 9], [22, 9]], reason: '촉수 끝의 대각선 접촉' },
  { kind: 'fish', key: 'kraken.variant', rule: 'diagonal', cells: [[18, 9], [22, 9]], reason: '촉수 끝의 대각선 접촉' },
  { kind: 'fish', key: 'hand:jasconius', rule: 'diagonal', cells: [[25, 12]], reason: '손으로 그린 원화의 대각선 접촉' },
  { kind: 'fish', key: 'shape:ribbon', rule: 'diagonal', cells: [[18, 7]], reason: '초안 형태 격자의 대각선 접촉' },
  { kind: 'fish', key: 'shape:anglerfish', rule: 'margin', cells: [[15, 1], [16, 1]], reason: '초안 형태 격자의 초롱불이 안전 여백 안에 든다' },
  { kind: 'boat', key: 'tier5', rule: 'diagonal', cells: [[12, 0], [14, 1], [15, 2]], reason: '연기 조각이 대각선으로 이어진다' },
  { kind: 'boat', key: 'tier5', rule: 'diagonal', cells: [[2, 11]], reason: '들린 뱃머리가 선체와 대각선으로 닿는다' },
  { kind: 'boat', key: 'tier6', rule: 'diagonal', cells: [[11, 0], [18, 0]], reason: '연기 조각이 굴뚝 꼭대기와 대각선으로 닿는다' },
  { kind: 'boat', key: 'tier6', rule: 'diagonal', cells: [[1, 11]], reason: '들린 뱃머리가 선체와 대각선으로 닿는다' },
  { kind: 'boat', key: 'tier7', rule: 'diagonal', cells: [[1, 11]], reason: '들린 뱃머리가 선체와 대각선으로 닿는다' },
  { kind: 'boat', key: 'tier8', rule: 'diagonal', cells: [[1, 11]], reason: '들린 뱃머리가 선체와 대각선으로 닿는다' },
  { kind: 'boat', key: 'tier8', rule: 'diagonal', cells: [[29, 11]], reason: '선미 기둥 아래 끝이 갑판 끝과 대각선으로 닿는다' },
];

const excepted = (kind: SpriteKind, key: string, rule: RuleName, x: number, y: number) =>
  EXCEPTIONS.some(e => e.kind === kind && e.key === key && e.rule === rule && e.cells.some(([cx, cy]) => cx === x && cy === y));

describe('모든 생성 격자의 공통 규칙', () => {
  for (const kind of SPRITE_KINDS) {
    const target = SPRITE_TARGETS[kind];
    const entries = Object.entries(GRIDS[kind]);

    it(`${kind}: 격자가 정의된 대상만 격자를 갖고 크기가 정의와 같다`, () => {
      if (!target.layout) { expect(entries).toEqual([]); return; }
      const { grid } = target.layout;
      expect(entries.length).toBeGreaterThan(0);
      for (const [key, s] of entries) expect([key, s.w, s.h]).toEqual([key, grid.w, grid.h]);
    });

    it(`${kind}: 대각선 접촉, 부유 픽셀, 안전 여백 위반이 예외 목록 밖에 없다`, () => {
      const margin = target.layout?.margin ?? 0;
      const found: string[] = [];
      for (const [key, s] of entries) for (const rows of s.frames) {
        for (const v of checkRows(rows, margin)) if (!excepted(kind, key, v.rule, v.x, v.y)) found.push(`${key} ${v.rule} (${v.x},${v.y})`);
      }
      expect(found).toEqual([]);
    });
  }

  it('예외 목록의 모든 항목이 아직 실제 위반이다', () => {
    const stale: string[] = [];
    for (const e of EXCEPTIONS) {
      const s = GRIDS[e.kind][e.key];
      if (!s) { stale.push(`${e.kind}:${e.key} 격자 없음`); continue; }
      const live = s.frames.flatMap(rows => checkRows(rows, SPRITE_TARGETS[e.kind].layout?.margin ?? 0));
      for (const [x, y] of e.cells) {
        if (!live.some(v => v.rule === e.rule && v.x === x && v.y === y)) stale.push(`${e.kind}:${e.key} ${e.rule} (${x},${y})`);
      }
    }
    expect(stale).toEqual([]);
  });
});
