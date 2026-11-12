// 원화 PNG → 인덱스 격자 변환 CLI.
// 사용: pnpm exec tsx tools/sprite-draft/import-png.ts <대상 종류> [png 폴더] [out.ts]
// 대상 종류는 src/game/content/sprites/targets.ts 의 정의 키다. 기본 입력은 tools/sprite-draft/png/<대상>/,
// 기본 출력은 src/game/content/sprites/<대상>Sprites.generated.ts 다. 변환 규칙은 importPng.ts 를 본다.
import { writeFileSync } from 'node:fs';
import { SPRITE_TARGETS, definedLayout } from '../../src/game/content/sprites/targets';
import type { SpriteKind } from '../../src/game/content/sprites/targets';
import { generatedPath, importTarget, pngDir } from './importPng';

const [, , kind, dirArg, outArg] = process.argv;
if (!kind || !(kind in SPRITE_TARGETS)) {
  console.error(`usage: import-png.ts <${Object.keys(SPRITE_TARGETS).join('|')}> [png dir] [out.ts]`);
  process.exit(1);
}
const target = SPRITE_TARGETS[kind as SpriteKind];
const out = outArg ?? generatedPath(target.kind);
const { source, count, maxColors } = importTarget(target, dirArg ?? pngDir(target.kind));
writeFileSync(out, source);
const { w, h } = definedLayout(target).grid;
console.log(`${count} sprites (${w}x${h}, max ${maxColors} colors) → ${out}`);
