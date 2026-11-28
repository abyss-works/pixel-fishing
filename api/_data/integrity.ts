// 계정별 추첨 가중치 상태(integrity_states)와 변화 이력(integrity_events)의 쓰기 소유 모듈.
// 상태는 액션 확정과 같은 문장에서만 바뀌고, 관리자 조회와 초기화는 이 모듈을 거친다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { fishById } from '../../src/game/content/fish.js';
import { RARITY_ORDER, rarityShareOf } from '../../src/game/rules/logic.js';
import type { RarityId } from '../../src/game/rules/logic.js';
import type { SpotId } from '../../src/game/content/spots.js';
import { emptyIntegrityState, sanitizeIntegrityState } from '../../src/game/rules/integrity.js';
import type { IntegrityEvaluation, IntegrityState } from '../../src/game/rules/integrity.js';
import { at } from './json.js';

/** 계정의 현재 가중치 상태를 읽는다. 행이 없으면 빈 상태다 */
export async function readIntegrityState(db: Executor, uid: string): Promise<IntegrityState> {
  const { rows } = await db.execute<{ pressure: number; samples: unknown }>(
    sql`select pressure, samples from public.integrity_states where user_id = ${uid}`,
  );
  if (rows.length === 0) return emptyIntegrityState();
  return sanitizeIntegrityState({ pressure: Number(rows[0].pressure), samples: rows[0].samples });
}

/** 액션 확정 가드와 함께 계정의 가중치 상태를 덮어쓴다. 평가 뒤 관리자 초기화가 끼어들면 읽어 둔 이전 상태와 달라졌으므로 갱신하지 않는다 */
export function integrityStateFragment(guard: SQL, uid: string, evaluation: IntegrityEvaluation, nowISO: string): SQL {
  return sql`insert into public.integrity_states (user_id, pressure, stage, samples, updated_at)
    select ${uid}, ${evaluation.pressureAfter}, ${evaluation.stageAfter}, ${JSON.stringify(evaluation.state.samples)}::jsonb, ${at(nowISO)}
    where ${guard}
    on conflict (user_id) do update set
      pressure = excluded.pressure,
      stage = excluded.stage,
      samples = excluded.samples,
      updated_at = excluded.updated_at
    where public.integrity_states.pressure = ${evaluation.stateBefore.pressure}
      and public.integrity_states.samples = ${JSON.stringify(evaluation.stateBefore.samples)}::jsonb`;
}

/** 창 판정 또는 단계 변경의 이력을 확정 가드와 함께 남긴다. 둘 다 없으면 null이다 */
export function integrityEventFragment(guard: SQL, uid: string, evaluation: IntegrityEvaluation, nowISO: string): SQL | null {
  const stageChanged = evaluation.stageBefore !== evaluation.stageAfter;
  if ((!evaluation.triggered || !evaluation.signal) && !stageChanged) return null;
  const detector = evaluation.signal?.detector ?? 'decay';
  const signal = evaluation.signal ?? { kind: 'leak' };
  return sql`insert into public.integrity_events
      (user_id, detector, signal, pressure_before, pressure_after, stage_before, stage_after, created_at)
    select ${uid}, ${detector}, ${JSON.stringify(signal)}::jsonb,
      ${evaluation.pressureBefore}, ${evaluation.pressureAfter}, ${evaluation.stageBefore}, ${evaluation.stageAfter}, ${at(nowISO)}
    where ${guard}
      and (
        not exists (select 1 from public.integrity_states s where s.user_id = ${uid})
        or exists (select 1 from public.integrity_states s
          where s.user_id = ${uid}
            and s.pressure = ${evaluation.stateBefore.pressure}
            and s.samples = ${JSON.stringify(evaluation.stateBefore.samples)}::jsonb)
      )`;
}

/** 관리자 초기화 — 압력과 입력 창을 즉시 빈 상태로 되돌린다. 행이 없으면 빈 행을 만든다 */
export async function resetIntegrityState(db: Executor, uid: string, nowISO: string): Promise<void> {
  await db.execute(sql`insert into public.integrity_states (user_id, pressure, stage, samples, updated_at)
    values (${uid}, 0, 0, '[]'::jsonb, ${at(nowISO)})
    on conflict (user_id) do update set pressure = 0, stage = 0, samples = '[]'::jsonb, updated_at = excluded.updated_at`);
}

/** 계정 정리에서 사용자의 가중치 상태와 변화 이력을 모두 지운다 */
export async function deleteUserIntegrity(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.integrity_events where user_id = ${uid}`);
  await db.execute(sql`delete from public.integrity_states where user_id = ${uid}`);
}

export interface IntegrityStageAccount {
  userId: string;
  pressure: number;
  stage: number;
  modifier: number | null;
  updatedAt: unknown;
}

export interface IntegrityStageSummary {
  stage: number;
  count: number;
  accounts: IntegrityStageAccount[];
}

/** 구간별 계정 수와 계정별 현재 값 — 관리자 조회용. 배수는 호출자가 현재 설정으로 계산해 준다 */
export async function listIntegrityStages(
  db: Executor,
  modifierForStage: (stage: number) => number | null = () => null,
): Promise<IntegrityStageSummary[]> {
  const { rows } = await db.execute<{ user_id: string; pressure: number; stage: number; updated_at: unknown }>(sql`
    select user_id, pressure, stage, updated_at
    from public.integrity_states
    order by stage, user_id`);
  const grouped = new Map<number, IntegrityStageAccount[]>();
  for (const r of rows) {
    const stage = Number(r.stage);
    const accounts = grouped.get(stage) ?? [];
    accounts.push({
      userId: r.user_id,
      pressure: Number(r.pressure),
      stage,
      modifier: modifierForStage(stage),
      updatedAt: r.updated_at,
    });
    grouped.set(stage, accounts);
  }
  return [...grouped.entries()].sort((a, b) => a[0] - b[0])
    .map(([stage, accounts]) => ({ stage, count: accounts.length, accounts }));
}

export interface IntegrityEventRow {
  id: number;
  userId: string;
  detector: string;
  signal: unknown;
  pressureBefore: number;
  pressureAfter: number;
  stageBefore: number;
  stageAfter: number;
  createdAt: unknown;
}

/** 변화 이력 — 최신 순. user를 주면 그 계정만 본다 */
export async function listIntegrityEvents(db: Executor, user: string | null, limit: number): Promise<IntegrityEventRow[]> {
  const filter = user === null ? sql`true` : sql`user_id = ${user}`;
  const { rows } = await db.execute<{
    id: number; user_id: string; detector: string; signal: unknown;
    pressure_before: number; pressure_after: number; stage_before: number; stage_after: number; created_at: unknown;
  }>(sql`select id, user_id, detector, signal, pressure_before, pressure_after, stage_before, stage_after, created_at
    from public.integrity_events
    where ${filter}
    order by id desc
    limit ${limit}`);
  return rows.map(r => ({
    id: Number(r.id), userId: r.user_id, detector: r.detector, signal: r.signal,
    pressureBefore: Number(r.pressure_before), pressureAfter: Number(r.pressure_after),
    stageBefore: Number(r.stage_before), stageAfter: Number(r.stage_after), createdAt: r.created_at,
  }));
}

interface CohortAcc {
  total: number;
  /** `${weighting}|${spot}` → 캐치 수 */
  spotWeights: Map<string, { spot: string; weighting: number; n: number }>;
  counts: Record<RarityId, number>;
}

const emptyCounts = (): Record<RarityId, number> => ({ common: 0, rare: 0, epic: 0, legendary: 0 });
const emptyCohort = (): CohortAcc => ({ total: 0, spotWeights: new Map(), counts: emptyCounts() });

const sharesOf = (counts: Record<RarityId, number>, total: number): Record<RarityId, number> => ({
  common: total > 0 ? counts.common / total : 0,
  rare: total > 0 ? counts.rare / total : 0,
  epic: total > 0 ? counts.epic / total : 0,
  legendary: total > 0 ? counts.legendary / total : 0,
});

/** 그 코호트의 수역·캐치 시점 배수 이용 비율로 가중한 기대 등급 확률 */
function expectedShares(acc: CohortAcc): Record<RarityId, number> {
  const out = emptyCounts();
  if (acc.total === 0) return out;
  for (const { spot, weighting, n } of acc.spotWeights.values()) {
    for (const rarity of RARITY_ORDER) {
      const highMult = rarity === 'common'
        ? 1
        : weighting * (rarity === 'legendary' ? weighting : 1);
      try { out[rarity] += rarityShareOf(spot as SpotId, rarity) * highMult * (n / acc.total); } catch { /* 알 수 없는 수역은 기준에서 뺀다 */ }
    }
  }
  const sum = RARITY_ORDER.reduce((s, r) => s + out[r], 0);
  return sum > 0
    ? { common: out.common / sum, rare: out.rare / sum, epic: out.epic / sum, legendary: out.legendary / sum }
    : out;
}

/** 검증 지표 — 캐치 시점에 기록된 적용 배수로 나눈 집단의 최근 캐치 등급 분포를 기대 분포와 함께 돌려준다 */
export async function integrityValidationMetrics(db: Executor, days: number): Promise<unknown> {
  const { rows } = await db.execute<{ cohort: string; weighting: number; fish_id: string | null; spot: string | null; n: number }>(sql`
    select case when e.weighting < 1 then 'pressured' else 'clean' end as cohort,
      e.weighting,
      e.payload->>'fishId' as fish_id, e.payload->>'spot' as spot, count(*)::int as n
    from public.events e
    where e.type = 'catch' and e.weighting is not null
      and e.created_at >= now() - (${days}::int * interval '1 day')
    group by 1, 2, 3, 4`);
  const cohorts = { clean: emptyCohort(), pressured: emptyCohort() };
  for (const row of rows) {
    const acc = row.cohort === 'pressured' ? cohorts.pressured : cohorts.clean;
    const fish = row.fish_id ? fishById(row.fish_id) : undefined;
    if (!fish) continue;
    const n = Number(row.n);
    const weighting = Number(row.weighting);
    acc.total += n;
    acc.counts[fish.rarity] += n;
    if (row.spot) {
      const key = `${weighting}|${row.spot}`;
      const cur = acc.spotWeights.get(key) ?? { spot: row.spot, weighting, n: 0 };
      cur.n += n;
      acc.spotWeights.set(key, cur);
    }
  }
  const project = (acc: CohortAcc) => ({
    total: acc.total,
    counts: acc.counts,
    shares: sharesOf(acc.counts, acc.total),
    expectedShares: expectedShares(acc),
  });
  return { days, clean: project(cohorts.clean), pressured: project(cohorts.pressured) };
}

export interface ClaimConsistencyRow {
  userId: string;
  total: number;
  ok: number;
  mismatch: number;
  missingPos: number;
  mismatchRate: number;
}

/** 수동 캐치 판정 일관성 집계 — 기간 내 사용자별 claimCheck 분포와 불일치율을 돌려준다 */
export async function claimConsistencyByUser(db: Executor, sinceISO: string): Promise<ClaimConsistencyRow[]> {
  const { rows } = await db.execute<{
    user_id: string;
    total: number;
    ok: number;
    mismatch: number;
    missing_pos: number;
  }>(sql`
    select
      e.user_id,
      count(*)::int as total,
      count(*) filter (where e.payload->>'claimCheck' = 'ok')::int as ok,
      count(*) filter (where e.payload->>'claimCheck' = 'mismatch')::int as mismatch,
      count(*) filter (where e.payload->>'claimCheck' = 'missing-pos')::int as missing_pos
    from public.events e
    where e.type = 'catch'
      and e.payload->>'claimCheck' is not null
      and e.created_at >= ${at(sinceISO)}
    group by e.user_id
    order by mismatch desc, total desc, e.user_id`);
  return rows.map(r => {
    const total = Number(r.total);
    const ok = Number(r.ok);
    const mismatch = Number(r.mismatch);
    const missingPos = Number(r.missing_pos);
    return {
      userId: r.user_id,
      total,
      ok,
      mismatch,
      missingPos,
      mismatchRate: total > 0 ? mismatch / total : 0,
    };
  });
}
