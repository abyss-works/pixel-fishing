// 원화 PNG → 인덱스 격자 변환 CLI.
// 사용: pnpm exec tsx tools/sprite-draft/import-png.ts <대상 종류> [png 폴더] [out.ts]
// 대상 종류는 대상 정의의 키다. 기본 입력은 tools/sprite-draft/png/<대상>/,
// 기본 출력은 src/game/content/sprites/<대상>Sprites.generated.ts 다. 변환 규칙은 importPng.ts 를 본다.
import { writeFileSync } from 'node:fs';
import { definedLayout } from '../../src/game/content/sprites/targets';
import { targetOf } from './cliArgs';
import { generatedPath, importTarget, pngDir } from './importPng';

const [, , kind, dirArg, outArg] = process.argv;
const target = targetOf(kind);
const out = outArg ?? generatedPath(target.kind);
const { source, count, maxColors } = importTarget(target, dirArg ?? pngDir(target.kind));
writeFileSync(out, source);
const { w, h } = definedLayout(target).grid;
console.log(`${count} sprites (${w}x${h}, max ${maxColors} colors) → ${out}`);
