// 원화 화풍 검사 CLI — 기존 원화 집합의 지표 분포와 합격선을 출력하고, 후보 원화(일반·변이)를 판정한다.
// 사용: npx tsx tools/sprite-draft/style-check.ts [png 폴더] [--ids a,b,c]
// 기본 폴더는 tools/sprite-draft/png/fish, 기본 후보는 남대서양 신규 어종. 후보를 뺀 일반 폼 전부가 기준 집합이다.
// 하나라도 탈락하면 종료 코드 1.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATE_IDS, LOWER_BOUND, RANGE_BOUND, UPPER_BOUND,
  buildCriteria, judgeSet, judgeSprite, measure, readSpriteDir,
} from './styleMetrics';
import type { Metrics } from './styleMetrics';

const args = process.argv.slice(2);
const idsIdx = args.indexOf('--ids');
const ids = idsIdx >= 0 ? args[idsIdx + 1].split(',') : CANDIDATE_IDS;
const dirArg = args.find((a, i) => !a.startsWith('--') && i !== idsIdx + 1);
const dir = resolve(dirArg ?? join(dirname(fileURLToPath(import.meta.url)), 'png/fish'));

const ref = readSpriteDir(dir, new Set(ids));
const criteria = buildCriteria(ref.map(r => measure(r.grid)));
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

console.log(`기준 집합 ${criteria.n}종 (후보 ${ids.length}종 제외)`);
console.log('지표        평균     최소     하위10%  상위10%  최대     판정선');
for (const k of [...LOWER_BOUND, ...UPPER_BOUND, ...RANGE_BOUND]) {
  const d = criteria.dist[k];
  const rule = LOWER_BOUND.includes(k) ? `>= ${fmt(d.p10)}` : UPPER_BOUND.includes(k) ? `<= ${fmt(d.p90)}` : `${fmt(d.min)} ~ ${fmt(d.max)}`;
  console.log(`${k.padEnd(11)} ${[d.mean, d.min, d.p10, d.p90, d.max].map(v => fmt(Number(v.toFixed(2))).padEnd(8)).join(' ')} ${rule}`);
}
const share = (s: Record<string, number>) => Object.entries(s).sort().map(([k, v]) => `${k}:${Math.round(v * 100)}%`).join(' ');
console.log(`눈 모양 몫   ${share(criteria.eyeShare)}`);
console.log(`아가미 몫    ${share(criteria.gillShare)}`);

let failed = 0;
const normals: Metrics[] = [];
console.log('\n후보 판정');
for (const id of ids) {
  for (const form of ['', '.variant']) {
    const key = `${id}${form}`;
    if (!existsSync(join(dir, `${key}.png`))) continue;
    const m = measure(readSpriteDir(dir, new Set(), [key])[0].grid);
    if (!form) normals.push(m);
    const fails = judgeSprite(m, criteria);
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'ok  '} ${key.padEnd(24)} 영역${m.regions} 점${m.specks} 연속${m.meanRun.toFixed(2)} 밴드${m.bandRows.toFixed(2)} 꼬리색${m.tailColors} 높이${m.bodyHeight} 종횡${m.aspect.toFixed(2)} 아가미${m.gill} 눈${m.eye}${fails.length ? '  ' + fails.join('; ') : ''}`);
  }
}
const setFails = judgeSet(normals, criteria);
for (const f of setFails) console.log(`FAIL 집합 ${f}`);
console.log(failed || setFails.length ? `\n탈락 ${failed}건, 집합 ${setFails.length}건` : '\n모두 합격');
process.exit(failed || setFails.length ? 1 : 0);
