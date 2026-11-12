// 에디터용 대상 정의 스크립트(targets.generated.js)를 다시 쓴다.
// 사용: pnpm exec tsx tools/sprite-editor/build-targets.ts
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetsScript } from './targetsScript';

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'targets.generated.js');
writeFileSync(out, targetsScript());
console.log(`→ ${out}`);
