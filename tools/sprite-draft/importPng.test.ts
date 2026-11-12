import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_TARGETS } from '../../src/game/content/sprites/targets';
import type { SpriteTarget } from '../../src/game/content/sprites/targets';
import { Bitmap } from './png';
import { generatedPath, importTarget, pngDir } from './importPng';

const here = dirname(fileURLToPath(import.meta.url));

// 정의에 없던 새 종류 한 행과 PNG 폴더만으로 만든 대상
const FIXTURE: SpriteTarget = {
  kind: 'ramen',
  layout: { grid: { w: 8, h: 8 }, margin: 1, presets: { icon: { w: 16, h: 16, scale: 2 } } },
  palette: 'per-sprite',
  states: ['default'],
  motion: 'none',
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-fixture-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function png(name: string, w: number, h: number, paint: (b: Bitmap) => void = b => { b.fill(2, 2, 3, 3, '#ff0000'); b.fill(3, 3, 1, 1, '#00ff00'); }) {
  const b = new Bitmap(w, h);
  paint(b);
  writeFileSync(join(dir, name), b.png());
}

describe('importTarget', () => {
  it('정의 1행과 PNG 폴더만으로 새 대상의 생성 파일 원문을 만든다', () => {
    expect(Object.keys(SPRITE_TARGETS)).not.toContain(FIXTURE.kind);
    png('soup.png', 8, 8);
    png('stew.png', 8, 8);
    png('preview-all.png', 40, 40);
    const r = importTarget(FIXTURE, dir);
    expect(r.count).toBe(2);
    expect(r.source).toContain("export const RAMEN_SPRITES_GENERATED: Readonly<Record<string, PixelSprite>> = {");
    expect(r.source).toContain("'soup': {\n    w: 8, h: 8,\n    palette: ['#ff0000', '#00ff00'],");
    expect(r.source).toContain("'stew': {");
    expect(r.source).not.toContain('preview');
    expect(r.source).toContain("      '..000...',\n      '..010...',");
  });

  it('생성 파일 경로와 PNG 폴더는 대상 종류에서 정한다', () => {
    expect(generatedPath('ramen')).toMatch(/src[\\/]game[\\/]content[\\/]sprites[\\/]ramenSprites\.generated\.ts$/);
    expect(pngDir('ramen')).toMatch(/tools[\\/]sprite-draft[\\/]png[\\/]ramen$/);
  });

  it('원화 크기가 정의의 격자와 다르면 거부한다', () => {
    png('soup.png', 8, 8);
    png('wide.png', 9, 8);
    expect(() => importTarget(FIXTURE, dir)).toThrow(/wide\.png.*9x8.*8x8/);
  });

  it('반투명 픽셀을 거부한다', () => {
    png('soup.png', 8, 8, b => { b.data.set([255, 0, 0, 128], (2 * 8 + 2) * 4); });
    expect(() => importTarget(FIXTURE, dir)).toThrow(/semi-transparent/);
  });

  it('variant 상태가 없는 대상의 variant 원화는 거부한다', () => {
    png('soup.png', 8, 8);
    png('soup.variant.png', 8, 8);
    expect(() => importTarget(FIXTURE, dir)).toThrow(/soup\.variant\.png.*variant/);
  });

  it('variant 상태가 있는 대상은 variant 원화를 가져온다', () => {
    png('soup.png', 8, 8);
    png('soup.variant.png', 8, 8);
    const r = importTarget({ ...FIXTURE, states: ['normal', 'variant'] }, dir);
    expect(r.source).toContain("'soup.variant': {");
  });

  it('격자가 미정인 대상은 거부한다', () => {
    png('soup.png', 8, 8);
    expect(() => importTarget(SPRITE_TARGETS.bait, dir)).toThrow(/bait/);
  });

  it('공용 팔레트의 코드 생성 대상은 거부한다', () => {
    expect(() => importTarget(SPRITE_TARGETS.boat, dir)).toThrow(/boat/);
  });

  it('PNG가 없는 폴더는 거부한다', () => {
    mkdirSync(join(dir, 'empty'));
    expect(() => importTarget(FIXTURE, join(dir, 'empty'))).toThrow(/PNG/);
  });

  it('물고기 생성 파일은 원화 PNG에서 만든 결과와 일치한다', () => {
    const r = importTarget(SPRITE_TARGETS.fish, resolve(here, 'png/fish'));
    expect(r.source).toBe(readFileSync(generatedPath('fish'), 'utf-8'));
  });
});
