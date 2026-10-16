// 밸런스 측정 CLI — 제품 규칙(추첨·낚싯대·배·바운티 데이터)을 그대로 불러 기본 지표를 표로 찍는다.
// 사용: npx vite-node tools/balance-report.ts [income|growth|fame|dex|bounty ...] [--runs N] [--seed N]
//   섹션을 생략하면 전부 출력한다. dex 섹션은 몬테카를로(기본 400회, 시드 고정이라 결과가 재현된다).
//
// 가정(측정치가 아닌 근사):
//   - 낮밤 혼합 — 하루 중 밤 비율(게임 20~4시)만큼 밤 풀로 추첨한다.
//   - 수동 = GOOD 상시(일반 예산 ÷1.6), 방치 = 진입 직후(일반 ×10)와 파워 여유(+6레벨, 일반 ×4).
//   - 처리량 = 입질 평균 대기 + 판정 시간(수동은 바의 절반, 방치는 끝까지) + 획득 연출.
//   - 이동·판매 왕복·가방 한도·미끼·유물은 넣지 않는다. 돌연변이 기댓값은 넣는다.
//   - 해역은 진입 레벨(요구 파워를 처음 채우는 레벨)의 낚싯대로 측정한다.
import { SPOTS } from '../src/game/content/spots';
import type { SpotId } from '../src/game/content/spots';
import { BOATS } from '../src/game/content/boats';
import { FISH } from '../src/game/content/fish';
import type { Fish } from '../src/game/content/fish';
import { RARITY } from '../src/game/content/rarity';
import { BOUNTIES, BOUNTY_LICENSE_FAME } from '../src/game/content/bounties';
import type { BountyZone } from '../src/game/content/bounties';
import { topZoneOfSpot } from '../src/game/content/zones';
import { BAITS } from '../src/game/content/baits';
import { drawRows, rodStats } from '../src/game/rules/logic';
import type { DrawOptions } from '../src/game/rules/logic';
import { minLevelOfPower } from '../src/game/rules/stats';
import {
  CATCH_MS, MUTATION_RATE, NAMED_ENCOUNTER_RATE, VARIANT_PRICE_MULT, upgradeCost,
} from '../src/game/rules/balance';
import { DAY_START_MIN, NIGHT_START_MIN } from '../src/game/rules/time';

// ── 인자 ──
const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SECTIONS = ['income', 'growth', 'fame', 'dex', 'bounty'] as const;
const picked = SECTIONS.filter(s => args.includes(s));
const show = (s: typeof SECTIONS[number]) => picked.length === 0 || picked.includes(s);
const RUNS = flag('--runs', 400);
const SEED = flag('--seed', 20261016);

// ── 공통 ──
// 하루 60분 주기에서 낮은 [DAY_START_MIN, NIGHT_START_MIN) — 밤 비율은 그 나머지다
const NIGHT_SHARE = 1 - (NIGHT_START_MIN - DAY_START_MIN) / 60;
const VARIANT_EV = 1 + MUTATION_RATE * (VARIANT_PRICE_MULT - 1);
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const hrs = (x: number) => (!Number.isFinite(x) ? '∞' : x < 10 ? `${x.toFixed(1)}h` : `${n0(x)}h`);
const rodCum = (lv: number) => { let s = 0; for (let l = 1; l < lv; l++) s += upgradeCost(l); return s; };

/** 시드 고정 난수 — 같은 시드면 같은 결과(mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Row { fish: Fish; prob: number }
/** 해역의 개체 확률 — 낮/밤 풀을 하루 중 시간 비율로 섞는다.
 *  drawRows의 fishPct는 일반 배수(commonMult·rareMult)를 넣으면 합이 100이 아니다(설계표 기준 예산으로 나눔).
 *  실제 추첨은 가중치 합으로 나누므로 여기서도 시간대마다 합으로 정규화한다. */
function mixedRows(spot: SpotId, o: DrawOptions): Row[] {
  const p = new Map<string, number>();
  for (const [phase, w] of [['day', 1 - NIGHT_SHARE], ['night', NIGHT_SHARE]] as const) {
    const rows = drawRows(spot, { ...o, phase });
    const total = rows.reduce((s, r) => s + r.fishPct, 0);
    for (const r of rows) p.set(r.fish.id, (p.get(r.fish.id) ?? 0) + w * r.fishPct / total);
  }
  return [...p].map(([id, prob]) => ({ fish: FISH.find(f => f.id === id)!, prob }));
}

type Mode = 'manual' | 'idle' | 'idleFit';
const MODES: Record<Mode, { label: string; o: DrawOptions; lvBonus: number; fullSweep: boolean }> = {
  manual: { label: '수동 GOOD', o: { rareMult: 1.6 }, lvBonus: 0, fullSweep: false },
  idle: { label: '방치(진입)', o: { commonMult: 10 }, lvBonus: 0, fullSweep: true },
  idleFit: { label: '방치(+6Lv)', o: { commonMult: 4 }, lvBonus: 6, fullSweep: true },
};

interface Measure { rows: Row[]; catchesPerHour: number; goldPerHour: number; famePerHour: number }
function measure(spot: SpotId, mode: Mode): Measure {
  const m = MODES[mode];
  const lv = minLevelOfPower(SPOTS.find(s => s.id === spot)!.powerReq ?? 0) + m.lvBonus;
  const st = rodStats(lv);
  const sec = (st.biteMin + st.biteMax) / 2 + (m.fullSweep ? st.sweep : st.sweep / 2) + CATCH_MS / 1000;
  const rows = mixedRows(spot, m.o);
  const cph = 3600 / sec;
  return {
    rows, catchesPerHour: cph,
    goldPerHour: rows.reduce((s, r) => s + r.prob * r.fish.price, 0) * VARIANT_EV * cph,
    famePerHour: rows.reduce((s, r) => s + r.prob * RARITY[r.fish.rarity].fame, 0) * cph,
  };
}
const M = Object.fromEntries(SPOTS.map(s => [s.id, {
  lv: minLevelOfPower(s.powerReq ?? 0),
  manual: measure(s.id, 'manual'), idle: measure(s.id, 'idle'), idleFit: measure(s.id, 'idleFit'),
}])) as Record<SpotId, { lv: number } & Record<Mode, Measure>>;

const zonesOf = (zone: BountyZone) => SPOTS.filter(s => topZoneOfSpot(s.id) === zone);
const BOUNTY_ZONES = Object.keys(BOUNTY_LICENSE_FAME) as BountyZone[];

// ── 1. 수입 ──
if (show('income')) {
  console.log('\n## 1. 해역별 수입 (낮밤 혼합·돌연변이 포함, 진입 레벨 기준)');
  console.log('해역 | 진입Lv | 배 | G/h 수동 · 방치 · 방치(+6Lv) | 명성/h 수동 · 방치 | 캐치/h 수동 · 방치');
  for (const s of SPOTS) {
    const x = M[s.id];
    console.log(`${s.name} | ${x.lv} | ${s.boatTier} | ${n0(x.manual.goldPerHour)} · ${n0(x.idle.goldPerHour)} · ${n0(x.idleFit.goldPerHour)}`
      + ` | ${n0(x.manual.famePerHour)} · ${n0(x.idle.famePerHour)} | ${n0(x.manual.catchesPerHour)} · ${n0(x.idle.catchesPerHour)}`);
  }
}

// ── 2. 성장 요구량 ──
if (show('growth')) {
  console.log('\n## 2. 다음 해역 진입 비용 — 직전 해역 수입으로 버는 시간');
  for (let i = 1; i < SPOTS.length; i++) {
    const a = SPOTS[i - 1], b = SPOTS[i];
    const boat = b.boatTier > a.boatTier ? BOATS.find(x => x.tier === b.boatTier) : undefined;
    const rod = rodCum(M[b.id].lv) - rodCum(M[a.id].lv);
    const gold = (boat?.price ?? 0) + rod;
    console.log(`${a.name} → ${b.name}: ${n0(gold)}G (배 ${n0(boat?.price ?? 0)} + 강화 ${n0(rod)}, 명성 ${n0(boat?.fameReq ?? 0)})`
      + ` = 수동 ${hrs(gold / M[a.id].manual.goldPerHour)} · 방치 ${hrs(gold / M[a.id].idle.goldPerHour)}`);
  }
  console.log('강화비: ' + [1, 5, 10, 15, 18, 19, 20, 22, 25].map(l => `L${l}→${l + 1} ${n0(upgradeCost(l))}`).join(' · '));
  console.log('미끼: ' + BAITS.map(b => `${b.name} ${n0(b.price)}G`).join(' · ') + ' (수동 낚시 1회당 1개, 방치엔 효과·소모 없음)');
}

// ── 3. 명성 문턱 ──
if (show('fame')) {
  console.log('\n## 3. 명성 문턱까지 누적 시간 — 가진 명성으로 열리는 최고 해역에서 쌓는다고 가정');
  const gates = [
    ...BOATS.filter(b => b.fameReq > 0).map(b => ({ name: `${b.name}(배${b.tier})`, fame: b.fameReq })),
    ...BOUNTY_ZONES.map(z => ({ name: `라이선스 ${z}`, fame: BOUNTY_LICENSE_FAME[z] })),
  ].sort((x, y) => x.fame - y.fame);
  const bestSpot = (fame: number) => {
    const tier = Math.max(0, ...BOATS.filter(b => b.fameReq <= fame).map(b => b.tier));
    return SPOTS.filter(s => s.boatTier <= tier).at(-1)!;
  };
  for (const mode of ['manual', 'idle'] as const) {
    let fame = 0, h = 0;
    const out: string[] = [];
    for (const g of gates) {
      while (fame < g.fame) {
        const nextBoat = BOATS.filter(b => b.fameReq > fame).sort((a, b) => a.fameReq - b.fameReq)[0];
        const target = Math.min(g.fame, nextBoat?.fameReq ?? Infinity);
        h += (target - fame) / M[bestSpot(fame).id][mode].famePerHour;
        fame = target;
      }
      out.push(`${g.name} ${n0(g.fame)} → ${hrs(h)}`);
    }
    console.log(`${MODES[mode].label}: ${out.join(' · ')}`);
  }
}

// ── 4. 바운티 오픈 조건 — 구역 도감 ──
if (show('dex')) {
  console.log(`\n## 4. 바운티 라이선스 도감 조건 — 구역 해역을 번갈아 낚을 때 완성 기대 시간 (몬테카를로 ${RUNS}회, 시드 ${SEED})`);
  const rand = rng(SEED);
  const dexHours = (zone: BountyZone, mode: Mode, withLegend: boolean) => {
    const spots = zonesOf(zone);
    const targets = FISH.filter(f => spots.some(s => s.id === f.spot) && (withLegend || f.rarity !== 'legendary')).map(f => f.id);
    const tables = spots.map(s => M[s.id][mode]);
    const runs: number[] = [];
    for (let k = 0; k < RUNS; k++) {
      const left = new Set(targets);
      let catches = 0, secs = 0;
      while (left.size > 0 && catches < 5_000_000) {
        const t = tables[catches % tables.length];
        catches++; secs += 3600 / t.catchesPerHour;
        let r = rand();
        for (const row of t.rows) { r -= row.prob; if (r < 0) { left.delete(row.fish.id); break; } }
      }
      runs.push(secs / 3600);
    }
    runs.sort((a, b) => a - b);
    return `평균 ${hrs(runs.reduce((a, b) => a + b, 0) / runs.length)} · p90 ${hrs(runs[Math.floor(runs.length * 0.9)])}`;
  };
  for (const z of BOUNTY_ZONES) {
    console.log(`${z} (명성 ${n0(BOUNTY_LICENSE_FAME[z])})`);
    console.log(`  일반 의뢰(전설 제외): 수동 ${dexHours(z, 'manual', false)} / 방치 ${dexHours(z, 'idle', false)}`);
    console.log(`  네임드 토벌(전설 포함): 수동 ${dexHours(z, 'manual', true)} / 방치 ${dexHours(z, 'idle', true)}`);
  }
}

// ── 5. 의뢰 보상 ──
if (show('bounty')) {
  console.log('\n## 5. 의뢰 수행 시간과 보상 — 구역 해역 평균, 보상÷(같은 시간 판매 수입)');
  for (const z of BOUNTY_ZONES) {
    const spots = zonesOf(z);
    const avg = (f: (s: SpotId) => number) => spots.reduce((s, sp) => s + f(sp.id), 0) / spots.length;
    const named = BOUNTIES.find(q => q.zone === z && q.difficulty === 'named')!;
    const encounterH = 1 / NAMED_ENCOUNTER_RATE / avg(s => M[s].idle.catchesPerHour);
    console.log(`[${z}] 네임드 토벌 ${n0(named.reward)}G — 조우까지 방치 기대 ${hrs(encounterH)}`);
    for (const q of BOUNTIES.filter(b => b.zone === z && b.difficulty !== 'named')) {
      const line = (['manual', 'idle'] as const).map(mode => {
        const rate = avg(s => M[s][mode].rows.filter(r => r.fish.rarity === q.grade).reduce((a, r) => a + r.prob, 0) * M[s][mode].catchesPerHour);
        const h = q.count / rate;
        return `${MODES[mode].label} ${hrs(h)}(${(q.reward / (h * avg(s => M[s][mode].goldPerHour)) * 100).toFixed(0)}%)`;
      }).join(' · ');
      console.log(`  ${q.difficulty} ${q.grade}×${q.count} ${n0(q.reward)}G: ${line}`);
    }
  }
}
