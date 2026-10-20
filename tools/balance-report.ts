// 밸런스 측정 CLI — 원칙 문서(밸런스)의 측정 지표를 제품 규칙 그대로 계산해 표로 찍는다.
// 사용: pnpm balance [섹션 ...] [--runs N] [--seed N]
//   섹션: ev rod income growth journey fame monotonic economy dex bounty live (생략하면 live 외 전부)
//   live는 DATABASE_URL(운영·스테이징 DB 직접 연결)이 있을 때만 읽기 전용으로 조회한다.
//   dex는 몬테카를로(기본 400회, 시드 고정이라 결과가 재현된다).
// 모델 가정은 측정 모델 모듈의 머리 주석에 있다.
import { SPOTS } from '../src/game/content/spots';
import type { SpotId } from '../src/game/content/spots';
import { BOATS } from '../src/game/content/boats';
import { FISH } from '../src/game/content/fish';
import { RARITY, RARITY_ORDER } from '../src/game/content/rarity';
import { BOUNTIES, BOUNTY_LICENSE_FAME } from '../src/game/content/bounties';
import type { BountyZone } from '../src/game/content/bounties';
import { BAITS } from '../src/game/content/baits';
import { drawRows, mutationWeightsOf, namedEncounterShare, rarityWeightOf, variantShare } from '../src/game/rules/logic';
import { BAIT_WEIGHT_MULT, upgradeCost } from '../src/game/rules/balance';
import { DELTA_AXES, EV_AXES, buildBalanceReport } from '../src/features/admin/model/balanceReport';
import {
  AXES, AXIS_LABEL, SPEC_MARGIN, VARIANT_EV, ZONE_ORDER, axisAvailable, entryLevel, headroom, inversions,
  rates, rng, rodSpec, spotsOfZone, zoneOf,
} from './balance/model';
import type { Axis } from './balance/model';
import { simulateJourney } from './balance/journey';
import { runLive } from './balance/live';

// ── 인자 ──
const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SECTIONS = ['ev', 'rod', 'income', 'growth', 'journey', 'fame', 'monotonic', 'economy', 'dex', 'bounty', 'live'] as const;
const picked = SECTIONS.filter(s => args.includes(s));
const show = (s: typeof SECTIONS[number]) => (picked.length === 0 ? s !== 'live' : picked.includes(s));
const RUNS = flag('--runs', 400);
const SEED = flag('--seed', 20261016);

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const n1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const hrs = (x: number) => (!Number.isFinite(x) ? '∞' : x < 1 ? `${Math.round(x * 60)}분` : x < 10 ? `${x.toFixed(1)}h` : `${n0(x)}h`);
const rodCum = (lv: number) => { let s = 0; for (let l = 1; l < lv; l++) s += upgradeCost(l); return s; };
const nameOf = (spot: SpotId) => SPOTS.find(s => s.id === spot)!.name;

/** 해역·스펙·축별 수입 — 여러 섹션이 같이 쓴다 */
const R = new Map<string, ReturnType<typeof rates>>();
const rate = (spot: SpotId, axis: Axis, margin = 0) => {
  const key = `${spot}:${axis}:${margin}`;
  if (!R.has(key)) R.set(key, rates(spot, entryLevel(spot) + margin, axis));
  return R.get(key)!;
};
const manualAxis = (spot: SpotId, margin = 0): Axis => (axisAvailable(rodSpec(spot, entryLevel(spot) + margin), 'good') ? 'good' : 'normal');

/** 비교 축 — 방치가 기준 축이고 수동 GOOD은 보조 축이다. 출력은 기준 축을 먼저 둔다 */
type Play = 'idle' | 'manual';
const PLAYS: readonly Play[] = ['idle', 'manual'];
const PLAY_LABEL: Record<Play, string> = { idle: '방치', manual: '수동 GOOD' };
const playAxis = (spot: SpotId, play: Play, margin = 0): Axis => (play === 'idle' ? 'idle' : manualAxis(spot, margin));
const journeyOf = (play: Play) => simulateJourney(play === 'idle' ? 'idle' : 'good');
/** 두 축의 값을 기준 축부터 잇는다 */
const byPlay = (f: (play: Play) => string) => PLAYS.map(p => `${PLAY_LABEL[p]} ${f(p)}`).join(' · ');

// ── 기대값 (관리자 대시보드 어종·해역 탭과 같은 계산 — 낮 풀, 기본 판매가, 고정 다이얼) ──
if (show('ev')) {
  console.log('\n## 기대값 — 캐치당 골드·명성 (대시보드와 같은 계산: 낮 풀, 돌연변이 제외, 고정 다이얼)');
  console.log('해역 | 골드 무판정·GOOD·PERFECT·방치×4·방치×10 | 명성 같은 순 | 직전 대비 | 사다리 GOOD·PERFECT | 방치 폭 | 방치평균 vs 전 해역 | 등급 예산');
  const report = buildBalanceReport();
  const deltas = DELTA_AXES;
  report.forEach(r => {
    const g = EV_AXES.map(a => n1(r.gold[a.key])).join('·');
    const f = EV_AXES.map(a => n1(r.fame[a.key])).join('·');
    const d = (k: string) => deltas.find(a => a.key === k)?.compute(r);
    const budgets = Object.entries(r.budgets).map(([k, v]) => `${RARITY[k as keyof typeof RARITY].name}${v}`).join(' ');
    console.log(`${r.name} | ${g} | ${f} | ${r.deltaGold === null ? '—' : pct(r.deltaGold / (r.gold.normal - r.deltaGold))}`
      + ` | ${pct(r.gold.good / r.gold.normal - 1)}·${pct(r.gold.perfect / r.gold.good - 1)} | ${pct(r.gold.idleBest / r.gold.idleWorst - 1)}`
      + ` | ${n1(d('idleAvgDelta') ?? 0)}G | ${budgets}`);
  });
  console.log('\n### 실질 등급 비율 (낮 풀, 일반/희귀/영웅/전설)');
  for (const s of SPOTS) {
    const line = EV_AXES.map(a => {
      const rows = drawRows(s.id, a.options);
      const total = rows.reduce((t, x) => t + x.fishPct, 0);
      return `${a.short} ${RARITY_ORDER.map(k => n1(rows.filter(x => x.fish.rarity === k).reduce((t, x) => t + x.fishPct, 0) / total * 100)).join('/')}`;
    }).join(' · ');
    console.log(`${s.name}: ${line}`);
  }
}

// ── 낚싯대 스펙 ──
if (show('rod')) {
  console.log(`\n## 낚싯대 스펙 — 진입 레벨(최소)과 +${SPEC_MARGIN}(여유)`);
  console.log('해역 | 스펙 | Lv·파워 | 입질 최소~최대(초) | 바(초) | 노란·빨간 존 | 수동 보정 | 방치 배수');
  for (const s of SPOTS) {
    for (const m of [0, SPEC_MARGIN]) {
      const x = rodSpec(s.id, entryLevel(s.id) + m);
      console.log(`${s.name} | ${m ? '여유' : '최소'} | ${x.level}·${x.power} | ${n1(x.biteMin)}~${n1(x.biteMax)} | ${x.sweep.toFixed(2)}`
        + ` | ${x.yellow}%·${x.red}% | ×${x.manualBonus.toFixed(1)} | ×${x.idleBoost}`);
    }
  }
}

// ── 수입 ──
if (show('income')) {
  console.log('\n## 수입 — 시간당 골드·명성·캐치 (낮밤 혼합·돌연변이 포함)');
  for (const m of [0, SPEC_MARGIN]) {
    console.log(`\n### ${m ? `여유 스펙(+${m})` : '최소 스펙(진입 레벨)'} — 축: ${AXES.map(a => AXIS_LABEL[a]).join(' · ')} (존이 없는 축은 —)`);
    console.log('해역 | G/h | 명성/h | 캐치/h(방치·수동) | 수동GOOD÷방치 골드·명성·희귀이상');
    for (const s of SPOTS) {
      const spec = rodSpec(s.id, entryLevel(s.id) + m);
      const cell = (f: (r: ReturnType<typeof rates>) => number) =>
        AXES.map(a => (axisAvailable(spec, a) ? n0(f(rate(s.id, a, m))) : '—')).join(' · ');
      const man = rate(s.id, manualAxis(s.id, m), m), idle = rate(s.id, 'idle', m);
      const rare = (r: ReturnType<typeof rates>) => 1 - (r.rarity.common ?? 0);
      console.log(`${s.name} | ${cell(r => r.goldPerHour)} | ${cell(r => r.famePerHour)} | ${n0(idle.catchesPerHour)}·${n0(man.catchesPerHour)}`
        + ` | ×${(man.goldPerHour / idle.goldPerHour).toFixed(1)}·×${(man.famePerHour / idle.famePerHour).toFixed(1)}·×${(rare(man) / rare(idle)).toFixed(1)}`);
    }
  }
  console.log('\n### 지역 간 배율 — 지역 첫 해역의 시간당 골드(최소 스펙)');
  const firsts = ZONE_ORDER.map(z => spotsOfZone(z)[0]);
  for (let i = 1; i < firsts.length; i++) {
    const a = firsts[i - 1].id, b = firsts[i].id;
    const ratio = (p: Play) => `×${(rate(b, playAxis(b, p)).goldPerHour / rate(a, playAxis(a, p)).goldPerHour).toFixed(2)}`;
    console.log(`${ZONE_ORDER[i - 1]} → ${ZONE_ORDER[i]}: ${byPlay(ratio)} (${firsts[i - 1].name} → ${firsts[i].name})`);
  }
}

// ── 다음 해역 진입 비용 ──
if (show('growth')) {
  console.log('\n## 다음 해역 진입 비용 — 직전 해역 최소 스펙 수입으로 버는 시간');
  for (let i = 1; i < SPOTS.length; i++) {
    const a = SPOTS[i - 1], b = SPOTS[i];
    const boat = b.boatTier > a.boatTier ? BOATS.find(x => x.tier === b.boatTier) : undefined;
    const rod = rodCum(entryLevel(b.id)) - rodCum(entryLevel(a.id));
    const gold = (boat?.price ?? 0) + rod;
    console.log(`${a.name} → ${b.name}: ${n0(gold)}G (배 ${n0(boat?.price ?? 0)} + 강화 ${n0(rod)}, 명성 ${n0(boat?.fameReq ?? 0)})`
      + ` = ${byPlay(p => hrs(gold / rate(a.id, playAxis(a.id, p)).goldPerHour))}`);
  }
  console.log('강화비: ' + [1, 5, 10, 15, 18, 19, 20, 22, 25].map(l => `L${l}→${l + 1} ${n0(upgradeCost(l))}`).join(' · '));
}

// ── 새 계정 진행 ──
if (show('journey')) {
  console.log('\n## 새 계정 진행 — 열린 최고 해역에서 낚고 다음 해역에 필요한 배·강화를 바로 산다');
  for (const p of PLAYS) {
    const j = journeyOf(p);
    console.log(`\n### ${PLAY_LABEL[p]}`);
    console.log('도착 해역 | 누적 | 이전 해역에서 기다린 것(골드·명성·둘 다)');
    for (const a of j.arrivals.slice(1)) {
      console.log(`${nameOf(a.spot)} (${zoneOf(a.spot)}) | ${hrs(a.hours)} | ${hrs(a.waitGold / 3600)}·${hrs(a.waitFame / 3600)}·${hrs(a.waitBoth / 3600)}`);
    }
    const zoneFirst = ZONE_ORDER.map(z => j.arrivals.find(a => zoneOf(a.spot) === z)).filter(Boolean);
    console.log(`지역 첫 도착: ${zoneFirst.map(a => `${zoneOf(a!.spot)} ${hrs(a!.hours)}`).join(' · ')}`);
    for (const s of j.snapshots) {
      console.log(`첫 ${s.minutes}분: ${nameOf(s.spot)} · 배 ${s.boat} · Lv.${s.level} · 명성 ${n0(s.fame)} · 도감(일반) 기대 ${n1(s.dex)}종`);
    }
    console.log(`마지막 배 구매: ${j.lastBoatHours === null ? '—' : hrs(j.lastBoatHours)}`);
  }
}

// ── 명성 문턱 ──
if (show('fame')) {
  console.log('\n## 명성 문턱까지 누적 시간 — 가진 명성으로 열리는 최고 해역(최소 스펙)에서 쌓는다고 가정');
  const BOUNTY_ZONES = Object.keys(BOUNTY_LICENSE_FAME) as BountyZone[];
  const gates = [
    ...BOATS.filter(b => b.fameReq > 0).map(b => ({ name: `${b.name}(배${b.tier})`, fame: b.fameReq })),
    ...BOUNTY_ZONES.map(z => ({ name: `라이선스 ${z}`, fame: BOUNTY_LICENSE_FAME[z] })),
  ].sort((x, y) => x.fame - y.fame);
  const bestSpot = (fame: number) => {
    const tier = Math.max(0, ...BOATS.filter(b => b.fameReq <= fame).map(b => b.tier));
    return SPOTS.filter(s => s.boatTier <= tier).at(-1)!;
  };
  for (const p of PLAYS) {
    let fame = 0, h = 0;
    const out: string[] = [];
    for (const g of gates) {
      while (fame < g.fame) {
        const nextBoat = BOATS.filter(b => b.fameReq > fame).sort((a, b) => a.fameReq - b.fameReq)[0];
        const target = Math.min(g.fame, nextBoat?.fameReq ?? Infinity);
        const s = bestSpot(fame).id;
        h += (target - fame) / rate(s, playAxis(s, p)).famePerHour;
        fame = target;
      }
      out.push(`${g.name} ${n0(g.fame)} → ${hrs(h)}`);
    }
    console.log(`${PLAY_LABEL[p]}: ${out.join(' · ')}`);
  }
}

// ── 단조성 ──
if (show('monotonic')) {
  console.log('\n## 단조성 — 해역 순서대로 시간당 골드·명성이 줄어드는 쌍과 완화 여유');
  for (const m of [0, SPEC_MARGIN]) {
    for (const p of PLAYS) {
      const val = (s: SpotId, k: 'goldPerHour' | 'famePerHour') => rate(s, playAxis(s, p, m), m)[k];
      const label = `${PLAY_LABEL[p]} · ${m ? `여유 +${m}` : '최소 스펙'}`;
      const goldInv = inversions(SPOTS, s => val(s.id, 'goldPerHour'));
      const fameInv = inversions(SPOTS, s => val(s.id, 'famePerHour'));
      console.log(`\n### ${label}`);
      console.log(`골드 역전: ${goldInv.length ? goldInv.map(v => `${v.from.name}→${v.to.name} ${pct(v.drop)}`).join(' · ') : '없음'}`);
      console.log(`명성 역전: ${fameInv.length ? fameInv.map(v => `${v.from.name}→${v.to.name} ${pct(v.drop)}`).join(' · ') : '없음'}`);
      console.log('완화 여유(다음 해역까지, 골드·명성 중 작은 쪽): ' + SPOTS.slice(0, -1).map((s, i) => {
        const nx = SPOTS[i + 1].id;
        const room = Math.min(headroom(val(s.id, 'goldPerHour'), val(nx, 'goldPerHour')), headroom(val(s.id, 'famePerHour'), val(nx, 'famePerHour')));
        return `${s.name} ${pct(room)}`;
      }).join(' · '));
    }
  }
}

// ── 경제 ──
if (show('economy')) {
  console.log('\n## 경제');
  console.log('\n### 강화 1단계 시간 — 진입 레벨에서 다음 강화비를 버는 시간');
  console.log(SPOTS.map(s => {
    const c = upgradeCost(entryLevel(s.id));
    return `${s.name} L${entryLevel(s.id)} ${n0(c)}G ${byPlay(p => hrs(c / rate(s.id, playAxis(s.id, p)).goldPerHour))}`;
  }).join('\n'));
  const perCatch = (r: ReturnType<typeof rates>) => ({ g: r.goldPerHour / r.catchesPerHour, f: r.famePerHour / r.catchesPerHour });
  for (const p of PLAYS) {
    console.log(`\n### 미끼 손익 — ${PLAY_LABEL[p]} 최소 스펙, 캐치당 (판매가 증가 − 미끼값) · 명성 증가`);
    for (const s of SPOTS) {
      const b0 = perCatch(rate(s.id, playAxis(s.id, p)));
      const line = BAITS.map(bait => {
        const w = rarityWeightOf(s.id, bait.targetRarity);
        if (w <= 0) return `${bait.name} —`;
        const b1 = perCatch(rates(s.id, entryLevel(s.id), playAxis(s.id, p), { budgets: { [bait.targetRarity]: w * BAIT_WEIGHT_MULT } }));
        const df = b1.f - b0.f;
        return `${bait.name} ${n0(b1.g - b0.g - bait.price)}G·명성${df >= 0 ? '+' : ''}${n1(df)}`;
      }).join(' · ');
      console.log(`${s.name}: ${line}`);
    }
  }
  const last = SPOTS.at(-1)!;
  console.log('\n### 남는 골드 — 배를 모두 산 뒤의 소모처는 강화뿐');
  console.log(`마지막 배 구매(새 계정 진행): ${byPlay(p => {
    const h = journeyOf(p).lastBoatHours;
    return h === null ? '—' : hrs(h);
  })}`);
  for (const m of [0, SPEC_MARGIN]) {
    const lv = entryLevel(last.id) + m;
    console.log(`${last.name} Lv.${lv}: 다음 강화 ${n0(upgradeCost(lv))}G = ${byPlay(p => hrs(upgradeCost(lv) / rates(last.id, lv, playAxis(last.id, p, m)).goldPerHour))}`);
  }
}

// ── 수집 ──
if (show('dex')) {
  console.log(`\n## 수집 — 지역 해역을 번갈아 낚을 때(최소 스펙), 몬테카를로 ${RUNS}회, 시드 ${SEED}`);
  const rand = rng(SEED);
  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return `평균 ${hrs(s.reduce((a, b) => a + b, 0) / s.length)} · p90 ${hrs(s[Math.floor(s.length * 0.9)])}`;
  };
  const simulate = (zone: string, p: Play) => {
    const spots = spotsOfZone(zone);
    const tables = spots.map(s => rate(s.id, playAxis(s.id, p)));
    const ids = FISH.filter(f => spots.some(s => s.id === f.spot));
    const noLegend = ids.filter(f => f.rarity !== 'legendary').map(f => f.id);
    const all = ids.map(f => f.id);
    const out = { noLegend: [] as number[], all: [] as number[], variant: [] as number[], legend: [] as number[] };
    for (let k = 0; k < RUNS; k++) {
      const normal = new Set(all), variant = new Set(all);
      let secs = 0, catches = 0, tNo = -1, tAll = -1, tVar = -1, tLeg = ids.some(f => f.rarity === 'legendary') ? -1 : NaN;
      while ((tNo < 0 || tAll < 0 || tVar < 0 || tLeg < 0) && catches < 3_000_000) {
        const t = tables[catches % tables.length];
        catches++; secs += 3600 / t.catchesPerHour;
        let r = rand();
        for (const row of t.rows) {
          r -= row.prob;
          if (r >= 0) continue;
          if (rand() < variantShare(mutationWeightsOf({ artifacts: [] }, row.fish.spot))) variant.delete(row.fish.id); else normal.delete(row.fish.id);
          if (row.fish.rarity === 'legendary' && tLeg < 0) tLeg = secs;
          break;
        }
        if (tNo < 0 && noLegend.every(id => !normal.has(id))) tNo = secs;
        if (tAll < 0 && normal.size === 0) tAll = secs;
        if (tVar < 0 && variant.size === 0) tVar = secs;
      }
      out.noLegend.push(tNo / 3600); out.all.push(tAll / 3600); out.variant.push(tVar / 3600);
      if (!Number.isNaN(tLeg)) out.legend.push(tLeg / 3600);
    }
    return out;
  };
  for (const z of ZONE_ORDER) {
    const n = FISH.filter(f => spotsOfZone(z).some(s => s.id === f.spot)).length;
    console.log(`\n### ${z} (${n}종)`);
    for (const p of PLAYS) {
      const x = simulate(z, p);
      console.log(`${PLAY_LABEL[p]}: 일반(전설 제외) ${stat(x.noLegend)} | 일반 전부 ${stat(x.all)} | 돌연변이 전부 ${stat(x.variant)}`
        + ` | 전설 첫 조우 ${x.legend.length ? stat(x.legend) : '전설 없음'}`);
    }
  }
}

// ── 도전 ──
if (show('bounty')) {
  console.log('\n## 도전 — 의뢰 수행 시간과 보상 비율(보상 ÷ 같은 시간 판매 수입), 네임드 조우 시간');
  const BOUNTY_ZONES = Object.keys(BOUNTY_LICENSE_FAME) as BountyZone[];
  for (const z of BOUNTY_ZONES) {
    const spots = spotsOfZone(z);
    const avg = (f: (s: SpotId) => number) => spots.reduce((s, sp) => s + f(sp.id), 0) / spots.length;
    const named = BOUNTIES.find(q => q.zone === z && q.difficulty === 'named')!;
    const encounterH = (p: Play) => avg(s => 1 / namedEncounterShare(s)) / avg(s => rate(s, playAxis(s, p)).catchesPerHour);
    console.log(`[${z}] 네임드 토벌 ${n0(named.reward)}G — 조우까지 ${byPlay(p => hrs(encounterH(p)))}`);
    for (const q of BOUNTIES.filter(b => b.zone === z && b.difficulty !== 'named')) {
      const line = PLAYS.map(p => {
        const r = (s: SpotId) => rate(s, playAxis(s, p));
        const perHour = avg(s => r(s).rows.filter(x => x.fish.rarity === q.grade).reduce((a, x) => a + x.prob, 0) * r(s).catchesPerHour);
        const h = q.count / perHour;
        return `${PLAY_LABEL[p]} ${hrs(h)}(${(q.reward / (h * avg(s => r(s).goldPerHour)) * 100).toFixed(0)}%)`;
      }).join(' · ');
      console.log(`  ${q.difficulty} ${q.grade}×${q.count} ${n0(q.reward)}G: ${line}`);
    }
  }
  console.log(`(참고: 판매가 기대값에는 돌연변이 배수 ×${VARIANT_EV.toFixed(2)}가 들어 있다)`);
}

// ── 라이브 ──
if (show('live')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('\n## 라이브 — DATABASE_URL이 없어 건너뛴다(운영·스테이징 DB 직접 연결 주소를 환경 변수로 주면 읽기 전용으로 조회한다)');
  } else {
    console.log('\n## 라이브 — 실제 플레이 기록(읽기 전용)');
    await runLive(url, (title, rows) => {
      console.log(`\n### ${title}`);
      if (rows.length === 0) { console.log('(없음)'); return; }
      console.log(Object.keys(rows[0]).join(' | '));
      for (const r of rows) console.log(Object.values(r).map(v => (Array.isArray(v) ? v.join('·') : String(v))).join(' | '));
    });
  }
}
