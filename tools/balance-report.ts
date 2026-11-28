// 밸런스 측정 CLI — 원칙 문서(밸런스)의 측정 지표를 제품 규칙 그대로 계산해 표로 찍는다.
// 사용: pnpm balance [섹션 ...] [--runs N] [--seed N] [--json]
//   섹션: ev rod income idle move perfect growth journey fame monotonic economy dex achievement bounty live (생략하면 live와 achievement 외 전부)
//   achievement(자기만족 업적 달성 시간, 이름을 줄 때만 실행)는 --big 5,10(월척 어종 수 단계)과
//   --catch-steps 100,1000,10000,100000(낚은 수 단계)을 받는다. 몬테카를로(--runs, --seed)다.
//   live는 DATABASE_URL(운영·스테이징 DB 직접 연결)이 있을 때만 읽기 전용으로 조회한다.
//   dex는 몬테카를로(기본 400회, 시드 고정이라 결과가 재현된다).
// 모델 가정은 측정 모델 모듈의 머리 주석에 있다.
import { SPOTS } from '../src/game/content/spots';
import type { SpotId } from '../src/game/content/spots';
import { RARITY, RARITY_ORDER } from '../src/game/content/rarity';
import { upgradeCost } from '../src/game/rules/balance';
import { EV_AXES } from '../src/features/admin/model/balanceReport';
import { AXES, AXIS_LABEL, SPEC_MARGIN, VARIANT_EV, ZONE_ORDER, zoneOf } from './balance/model';
import {
  PLAYS, bountyMetrics, dexMetrics, economyMetrics, evMetrics, fameGateTimes,
  growthMetrics, idleMetrics, incomeMetrics, journeyMetrics, monotonicMetrics,
  moveMetrics, perfectMetrics, rodSpecMetrics,
} from './balance/reportMetrics';
import type { Play, TimeStat } from './balance/reportMetrics';
import { selfTimes } from './balance/selfTimes';
import type { TimeDistStat } from './balance/selfTimes';
import { runLive } from './balance/live';

// ── 인자 ──
const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SECTIONS = ['ev', 'rod', 'income', 'idle', 'move', 'perfect', 'growth', 'journey', 'fame', 'monotonic', 'economy', 'dex', 'achievement', 'bounty', 'live'] as const;
const picked = SECTIONS.filter(s => args.includes(s));
const show = (s: typeof SECTIONS[number]) => (picked.length === 0 ? s !== 'live' && s !== 'achievement' : picked.includes(s));
const RUNS = flag('--runs', 400);
const listFlag = (name: string, fallback: number[]): number[] => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) throw new Error(`${name}에는 쉼표로 구분한 정수 목록이 필요합니다`);
  const xs = raw.split(',').map(Number);
  if (xs.some(x => !Number.isInteger(x) || x < 1)) throw new Error(`${name}에는 1 이상의 정수 목록이 필요합니다: ${raw}`);
  return xs;
};
const BIG_STEPS = listFlag('--big', []);
const CATCH_STEPS = listFlag('--catch-steps', [100, 1_000, 10_000, 100_000]);
const SEED = flag('--seed', 20261016);
const JSON_OUT = args.includes('--json');
const jsonOut: Record<string, unknown> = {};

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const n1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
const hrs = (x: number) => (!Number.isFinite(x) ? '∞' : x < 1 ? `${Math.round(x * 60)}분` : x < 10 ? `${x.toFixed(1)}h` : `${n0(x)}h`);
const nameOf = (spot: SpotId) => SPOTS.find(s => s.id === spot)!.name;

const PLAY_LABEL: Record<Play, string> = { idle: '방치', manual: '수동 GOOD' };
const byPlay = (f: (play: Play) => string) => PLAYS.map(p => `${PLAY_LABEL[p]} ${f(p)}`).join(' · ');

// ── 기대값 (관리자 대시보드 어종·해역 탭과 같은 계산 — 낮 풀, 기본 판매가, 고정 다이얼) ──
if (show('ev')) {
  const ev = evMetrics();
  if (JSON_OUT) {
    jsonOut.ev = ev;
  } else {
    console.log('\n## 기대값 — 캐치당 골드·명성 (대시보드와 같은 계산: 낮 풀, 돌연변이 제외, 고정 다이얼)');
    console.log('해역 | 골드 무판정·GOOD·PERFECT·방치 플래토·방치 진입 | 명성 같은 순 | 직전 대비 | 사다리 GOOD·PERFECT | 방치 폭 | 방치평균 vs 전 해역 | 등급 예산');
    for (const row of ev.rows) {
      const r = row.spot;
      const g = EV_AXES.map(a => n1(r.gold[a.key])).join('·');
      const f = EV_AXES.map(a => n1(r.fame[a.key])).join('·');
      const budgets = Object.entries(r.budgets).map(([k, v]) => `${RARITY[k as keyof typeof RARITY].name}${v}`).join(' ');
      console.log(`${r.name} | ${g} | ${f} | ${row.deltaGoldPct === null ? '—' : pct(row.deltaGoldPct)}`
        + ` | ${pct(row.goodLadderPct)}·${pct(row.perfectLadderPct)} | ${pct(row.idleSpreadPct)}`
        + ` | ${n1(row.idleAvgDelta)}G | ${budgets}`);
    }
    console.log('\n### 실질 등급 비율 (낮 풀, 일반/희귀/영웅/전설)');
    for (const s of ev.rarityShares) {
      const line = s.axes.map(a => `${a.axis.short} ${a.shares.map(n1).join('/')}`).join(' · ');
      console.log(`${s.name}: ${line}`);
    }
  }
}

// ── 낚싯대 스펙 ──
if (show('rod')) {
  const rod = rodSpecMetrics();
  if (JSON_OUT) {
    jsonOut.rod = rod;
  } else {
    console.log(`\n## 낚싯대 스펙 — 진입 레벨(최소)과 +${SPEC_MARGIN}(여유)`);
    console.log('해역 | 스펙 | Lv·파워 | 입질 최소~최대(초) | 바(초) | 노란·빨간 존 | 방치 배수');
    for (const row of rod) {
      const x = row.spec;
      console.log(`${row.name} | ${row.margin ? '여유' : '최소'} | ${x.level}·${x.power} | ${n1(x.biteMin)}~${n1(x.biteMax)} | ${x.sweep.toFixed(2)}`
        + ` | ${x.yellow}%·${x.red}% | ×${x.idleBoost}`);
    }
  }
}

// ── 수입 ──
if (show('income')) {
  const inc = incomeMetrics();
  if (JSON_OUT) {
    jsonOut.income = inc;
  } else {
    console.log('\n## 수입 — 시간당 골드·명성·캐치 (낮밤 혼합·돌연변이 포함)');
    for (const table of inc.tables) {
      console.log(`\n### ${table.margin ? `여유 스펙(+${table.margin})` : '최소 스펙(진입 레벨)'} — 축: ${AXES.map(a => AXIS_LABEL[a]).join(' · ')} (존이 없는 축은 —)`);
      console.log('해역 | G/h | 명성/h | 캐치/h(방치·수동) | 수동GOOD÷방치 골드·명성·희귀이상');
      for (const r of table.rows) {
        const cell = (f: (x: NonNullable<typeof r.axes[typeof AXES[number]]>) => number) =>
          AXES.map(a => (r.axes[a] ? n0(f(r.axes[a]!)) : '—')).join(' · ');
        console.log(`${r.name} | ${cell(x => x.goldPerHour)} | ${cell(x => x.famePerHour)} | ${n0(r.idle.catchesPerHour)}·${n0(r.manual.catchesPerHour)}`
          + ` | ×${r.ratios.gold.toFixed(1)}·×${r.ratios.fame.toFixed(1)}·×${r.ratios.rare.toFixed(1)}`);
      }
    }
    console.log('\n### 지역 간 배율 — 지역 첫 해역의 시간당 골드(최소 스펙)');
    for (const z of inc.zoneMultipliers) {
      console.log(`${z.fromZone} → ${z.toZone}: ${byPlay(p => `×${z.ratios[p].toFixed(2)}`)} (${z.fromName} → ${z.toName})`);
    }
  }
}

// ── 방치 진입·플래토 ──
if (show('idle')) {
  const idle = idleMetrics();
  if (JSON_OUT) {
    jsonOut.idle = idle;
  } else {
    console.log(`
## 방치 기대값 — 진입 레벨(최소 스펙)과 플래토(진입 +${SPEC_MARGIN}, 여유 스펙)의 실제 방치 배수`);
    console.log('해역 | Lv(진입·플래토) | 방치 배수(진입·플래토) | 캐치당 G 낮 풀(진입·플래토) | G/h 낮 풀(진입·플래토) | G/h 낮밤 혼합(진입·플래토)');
    for (const r of idle) {
      console.log(`${r.name} | ${r.levels.join('·')} | ×${r.idleBoosts.join('·×')}`
        + ` | ${r.goldPerCatchDay.map(n1).join('·')} | ${r.goldPerHourDay.map(n0).join('·')} | ${r.goldPerHourMixed.map(n0).join('·')}`);
    }
  }
}

// ── 이동 직후 수입 ──
if (show('move')) {
  const mv = moveMetrics();
  if (JSON_OUT) {
    jsonOut.move = mv;
  } else {
    console.log('\n## 이동 직후 수입 — 새 해역 진입 레벨의 방치 G/h를, 같은 레벨로 낚을 수 있는 이전 해역 중 가장 높은 값과 비교');
    console.log('새 해역 | 비교 해역 | 낮 풀 차(비율) | 낮밤 혼합 차(비율)');
    const fmt = (g: typeof mv.rows[number]['day']) => (g.from ? `${n0(g.diff)} (${pct(g.ratio - 1)})` : '—');
    for (const r of mv.rows) {
      console.log(`${r.name} | ${r.day.from ? nameOf(r.day.from) : '—'} | ${fmt(r.day)} | ${fmt(r.mixed)}`);
    }
    console.log(`최악값: 낮 풀 ${pct(mv.worst.day)} · 낮밤 혼합 ${pct(mv.worst.mixed)} (0 미만이면 이동 직후 수입이 줄어드는 해역이 있다)`);
  }
}

// ── PERFECT 이상치 ──
if (show('perfect')) {
  const pf = perfectMetrics();
  if (JSON_OUT) {
    jsonOut.perfect = pf;
  } else {
    console.log(`
## PERFECT 이상치 — PERFECT 다이얼의 G/h ÷ 방치 G/h (낮밤 혼합, 빨간 존 유무와 관계없이 PERFECT 다이얼을 적용한 상한 값). 10배를 넘으면 이상치`);
    for (const r of pf.rows) {
      console.log(`${r.name}: 최소 ×${r.min.toFixed(2)} · 여유 ×${r.margin.toFixed(2)}`);
    }
    const maxLabel = `${pf.max.name} ${pf.max.margin ? `+${pf.max.margin}` : '최소'}`;
    console.log(`최대: ×${pf.max.value.toFixed(2)} (${maxLabel}) — ${pf.max.value > 10 ? '이상치 있음' : '10배 이하'}`);
  }
}

// ── 다음 해역 진입 비용 ──
if (show('growth')) {
  const g = growthMetrics();
  if (JSON_OUT) {
    jsonOut.growth = g;
  } else {
    console.log('\n## 다음 해역 진입 비용 — 직전 해역 최소 스펙 수입으로 버는 시간');
    for (const t of g.transitions) {
      console.log(`${t.fromName} → ${t.toName}: ${n0(t.gold)}G (배 ${n0(t.boatPrice)} + 강화 ${n0(t.rodCost)}, 명성 ${n0(t.fameReq)})`
        + ` = ${byPlay(p => hrs(t.hours[p]))}`);
    }
    console.log('강화비: ' + g.upgradeSamples.map(x => `L${x.level}→${x.level + 1} ${n0(x.cost)}`).join(' · '));
  }
}

// ── 새 계정 진행 ──
if (show('journey')) {
  const jm = journeyMetrics();
  if (JSON_OUT) {
    jsonOut.journey = jm;
  } else {
    console.log('\n## 새 계정 진행 — 열린 최고 해역에서 낚고 다음 해역에 필요한 배·강화를 바로 산다');
    for (const p of PLAYS) {
      const { journey: j, zoneFirsts } = jm[p];
      console.log(`\n### ${PLAY_LABEL[p]}`);
      console.log('도착 해역 | 누적 | 이전 해역에서 기다린 것(골드·명성·둘 다)');
      for (const a of j.arrivals.slice(1)) {
        console.log(`${nameOf(a.spot)} (${zoneOf(a.spot)}) | ${hrs(a.hours)} | ${hrs(a.waitGold / 3600)}·${hrs(a.waitFame / 3600)}·${hrs(a.waitBoth / 3600)}`);
      }
      console.log(`지역 첫 도착: ${zoneFirsts.map(z => `${z.zone} ${hrs(z.arrival.hours)}`).join(' · ')}`);
      for (const s of j.snapshots) {
        console.log(`첫 ${s.minutes}분: ${nameOf(s.spot)} · 배 ${s.boat} · Lv.${s.level} · 명성 ${n0(s.fame)} · 도감(일반) 기대 ${n1(s.dex)}종`);
      }
      console.log(`마지막 배 구매: ${j.lastBoatHours === null ? '—' : hrs(j.lastBoatHours)}`);
    }
  }
}

// ── 명성 문턱 ──
if (show('fame')) {
  const fame = fameGateTimes();
  if (JSON_OUT) {
    jsonOut.fame = fame;
  } else {
    console.log('\n## 명성 문턱까지 누적 시간 — 가진 명성으로 열리는 최고 해역(최소 스펙)에서 쌓는다고 가정');
    for (const r of fame) {
      console.log(`${PLAY_LABEL[r.play]}: ${r.gates.map(g => `${g.name} ${n0(g.fame)} → ${hrs(g.hours)}`).join(' · ')}`);
    }
  }
}

// ── 단조성 ──
if (show('monotonic')) {
  const mono = monotonicMetrics();
  if (JSON_OUT) {
    jsonOut.monotonic = mono;
  } else {
    console.log('\n## 단조성 — 해역 순서대로 시간당 골드·명성이 줄어드는 쌍과 완화 여유');
    for (const row of mono) {
      const label = `${PLAY_LABEL[row.play]} · ${row.margin ? `여유 +${row.margin}` : '최소 스펙'}`;
      console.log(`\n### ${label}`);
      console.log(`골드 역전: ${row.goldInversions.length ? row.goldInversions.map(v => `${v.from.name}→${v.to.name} ${pct(v.drop)}`).join(' · ') : '없음'}`);
      console.log(`명성 역전: ${row.fameInversions.length ? row.fameInversions.map(v => `${v.from.name}→${v.to.name} ${pct(v.drop)}`).join(' · ') : '없음'}`);
      console.log('완화 여유(다음 해역까지, 골드·명성 중 작은 쪽): ' + row.headrooms.map(h => `${h.name} ${pct(h.room)}`).join(' · '));
    }
  }
}

// ── 경제 ──
if (show('economy')) {
  const eco = economyMetrics();
  if (JSON_OUT) {
    jsonOut.economy = eco;
  } else {
    console.log('\n## 경제');
    console.log('\n### 강화 1단계 시간 — 진입 레벨에서 다음 강화비를 버는 시간');
    console.log(eco.upgradeTimes.map(u => `${u.name} L${u.level} ${n0(u.cost)}G ${byPlay(p => hrs(u.hours[p]))}`).join('\n'));
    console.log('\n### 남는 골드 — 배를 모두 산 뒤의 소모처는 강화뿐');
    console.log(`마지막 배 구매(새 계정 진행): ${byPlay(p => (eco.lastBoatHours[p] === null ? '—' : hrs(eco.lastBoatHours[p]!)))}`);
    for (const u of eco.endgameUpgrades) {
      console.log(`${u.name} Lv.${u.level}: 다음 강화 ${n0(upgradeCost(u.level))}G = ${byPlay(p => hrs(u.hours[p]))}`);
    }
  }
}

// ── 수집 ──
if (show('dex')) {
  const dex = dexMetrics(RUNS, SEED);
  if (JSON_OUT) {
    jsonOut.dex = dex;
  } else {
    console.log(`\n## 수집 — 지역 해역을 번갈아 낚을 때(최소 스펙), 몬테카를로 ${RUNS}회, 시드 ${SEED}`);
    const statLine = (s: TimeStat) => `평균 ${hrs(s.mean)} · p90 ${hrs(s.p90)}`;
    for (const z of dex) {
      console.log(`\n### ${z.zone} (${z.speciesCount}종)`);
      for (const p of PLAYS) {
        const x = z.byPlay[p];
        console.log(`${PLAY_LABEL[p]}: 일반(전설 제외) ${statLine(x.noLegend)} | 일반 전부 ${statLine(x.all)} | 돌연변이 전부 ${statLine(x.variant)}`
          + ` | 전설 첫 조우 ${x.legend ? statLine(x.legend) : '전설 없음'}`);
      }
    }
  }
}

// ── 자기만족 업적 달성 시간 ──
if (show('achievement')) {
  const results = selfTimes({ runs: RUNS, seed: SEED, big: BIG_STEPS, catchSteps: CATCH_STEPS });
  if (JSON_OUT) {
    jsonOut.achievement = { runs: RUNS, seed: SEED, big: BIG_STEPS, catchSteps: CATCH_STEPS, results };
  } else {
    console.log(`\n## 자기만족 업적 달성 시간 — 구역 해역을 번갈아 낚을 때(최소 스펙), 몬테카를로 ${RUNS}회, 시드 ${SEED}`);
    console.log('여러 구역에 걸친 조건은 구역을 하나씩 차례로 채우는 시간의 합이고, 각 조건은 그 조건 하나만 목표로 잰다(같은 낚시로 다른 조건도 채워지는 것은 넣지 않는다)');
    const statText = (s: TimeDistStat) => `평균 ${hrs(s.mean)} · p10 ${hrs(s.p10)} · 중앙값 ${hrs(s.p50)} · p90 ${hrs(s.p90)}`;
    for (const x of results) {
      console.log(`\n### ${PLAY_LABEL[x.play]}`);
      console.log(`등급별 일반 폼 전부(마을 포함 모든 구역): ${RARITY_ORDER.map(k => `${RARITY[k].name} ${statText(x.grades[k])}`).join(' | ')}`);
      console.log(`밤 어종 전부(모든 구역): 일반 폼 ${statText(x.night.normal)} | 돌연변이 폼 ${statText(x.night.variant)}`);
      console.log(`네임드 전부 토벌(유물 전부 교환 재료 포함, 라이선스·수주·하루 한도 제외): ${statText(x.named)}`);
      for (const b of x.big) {
        console.log(`월척 어종 ${b.n}종(구역 구분 없음, 구역을 ${ZONE_ORDER.join(', ')} 순서로 하나씩 채움): ${b.total ? statText(b.total) : '어종 수 부족'}`);
        console.log(`  참고, 구역 안에서만 ${b.n}종: ${b.zones.map(z => `${z.zone} ${z.time ? statText(z.time) : '어종 수 부족'}`).join(' | ')}`);
      }
      console.log(`월척 모든 어종(모든 구역): ${statText(x.bigAll)}`);
      console.log(`낚은 수 단계(새 계정 진행, 이후는 마지막 해역 캐치 속도): ${x.catches.map(c => `${n0(c.n)}마리 ${hrs(c.hours)}`).join(' | ')}`);
    }
  }
}

// ── 도전 ──
if (show('bounty')) {
  const bounty = bountyMetrics();
  if (JSON_OUT) {
    jsonOut.bounty = bounty;
  } else {
    console.log('\n## 도전 — 의뢰 수행 시간과 보상 비율(보상 ÷ 같은 시간 판매 수입), 네임드 조우 시간');
    for (const z of bounty) {
      console.log(`[${z.zone}] 네임드 토벌 ${n0(z.namedReward)}G — 조우까지 ${byPlay(p => hrs(z.encounterHours[p]))}`);
      for (const q of z.quests) {
        const line = PLAYS.map(p => `${PLAY_LABEL[p]} ${hrs(q.byPlay[p].hours)}(${q.byPlay[p].rewardPct.toFixed(0)}%)`).join(' · ');
        console.log(`  ${q.difficulty} ${q.grade}×${q.count} ${n0(q.reward)}G: ${line}`);
      }
    }
    console.log(`(참고: 판매가 기대값에는 돌연변이 배수 ×${VARIANT_EV.toFixed(2)}가 들어 있다)`);
  }
}

// ── 라이브 ──
if (show('live')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (JSON_OUT) {
      jsonOut.live = { skipped: true };
    } else {
      console.log('\n## 라이브 — DATABASE_URL이 없어 건너뛴다(운영·스테이징 DB 직접 연결 주소를 환경 변수로 주면 읽기 전용으로 조회한다)');
    }
  } else if (JSON_OUT) {
    const tables: Record<string, unknown[]> = {};
    await runLive(url, (title, rows) => { tables[title] = rows; });
    jsonOut.live = { tables };
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

if (JSON_OUT) {
  console.log(JSON.stringify(jsonOut, null, 2));
}
