// 업적 카운터 표(achievement_counters) 쓰기·읽기 소유 모듈.
// 액션 확정 문장 안에서 상태 변경과 원자적으로 함께 오르는 쓰기 조각과,
// 개발 도구용 절대값 설정·초기화·복원 조각을 둔다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { AchievementCounters, AchievementMap } from '../../src/game/content/achievements.js';
import { evaluateAchievements } from '../../src/game/rules/achievements.js';
import { migrate } from '../../src/game/rules/logic.js';
import type { GameState } from '../../src/game/rules/logic.js';
import { jsonParam, textArray } from './json.js';
import type { RecordRow } from './load.js';
import { blobInput } from './save.js';

/** DB 도감 행·저장 blob·카운터·네임드 토벌 목록에서 쓰기 없이 업적 상태를 순수 파생 평가한다 */
export function deriveAchievements(input: {
  data: unknown;
  records: readonly Pick<RecordRow, 'fish_id' | 'form' | 'count' | 'max_size' | 'first_caught'>[];
  counters: Record<string, number>;
  clearedNamed: readonly string[];
}): { achievements: AchievementMap; newlyClaimable: string[] } {
  const dex: GameState['dex'] = {};
  for (const r of input.records) {
    (dex[r.fish_id] ??= {})[r.form as keyof GameState['dex'][string]] = {
      count: Number(r.count),
      maxSize: r.max_size,
      first: r.first_caught?.slice(0, 10) ?? null,
    };
  }
  const rawData = input.data !== null && typeof input.data === 'object' && !Array.isArray(input.data)
    ? input.data as Record<string, unknown>
    : {};
  const state = migrate({
    ...blobInput(rawData),
    bag: [],
    exhibit: [],
    dex,
    achievementCounters: input.counters,
    clearedNamed: [...input.clearedNamed],
  });
  return evaluateAchievements(state);
}

/**
 * 카운터 증분을 확정 문장의 쓰기 조각으로 만든다. guard가 참(낙관 락 통과)일 때만 쓴다.
 * 증분은 더하기 방식이라 같은 확정이 여러 번 쓰여도 값은 한 번만 오른다 —
 * 확정 문장은 한 번만 실행되고, 실패하면 아무것도 쓰이지 않는다.
 * 증분이 없으면 null을 돌려 조각을 싣지 않는다.
 */
export function counterUpsertFragment(guard: SQL, uid: string, inc: AchievementCounters): SQL | null {
  const rows = Object.entries(inc).filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([key, value]) => ({ key, value }));
  if (rows.length === 0) return null;
  return sql`insert into public.achievement_counters (user_id, key, value, updated_at)
    select ${uid}, key, value, now()
    from json_to_recordset(${jsonParam(rows)}) as x(key text, value bigint)
    where ${guard}
    on conflict (user_id, key) do update
      set value = achievement_counters.value + excluded.value, updated_at = excluded.updated_at`;
}

/** 카운터 절대값 설정 조각 — 개발 도구 achievement.setCounter·snapshot.restore용 */
export function counterSetFragment(guard: SQL, uid: string, values: AchievementCounters): SQL | null {
  const rows = Object.entries(values)
    .filter(([, v]) => typeof v === 'number' && Number.isInteger(v) && v >= 0)
    .map(([key, value]) => ({ key, value }));
  if (rows.length === 0) return null;
  return sql`insert into public.achievement_counters (user_id, key, value, updated_at)
    select ${uid}, key, value, now()
    from json_to_recordset(${jsonParam(rows)}) as x(key text, value bigint)
    where ${guard}
    on conflict (user_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at`;
}

/** 카운터 초기화 조각 — keys가 있으면 해당 키만, 없으면 사용자의 모든 카운터 행을 지운다 */
export function counterClearFragment(guard: SQL, uid: string, keys?: readonly string[]): SQL | null {
  if (keys !== undefined) {
    if (keys.length === 0) return null;
    return sql`delete from public.achievement_counters
      where user_id = ${uid} and key = any(${textArray(keys)}) and ${guard}`;
  }
  return sql`delete from public.achievement_counters where user_id = ${uid} and ${guard}`;
}

/** 카운터 원자적 복원 조각 — 스냅샷에 없는 키는 삭제하고 남은 키는 절대값으로 덮는다(행 집합 분리) */
export function counterRestoreFragments(guard: SQL, uid: string, counters: AchievementCounters): SQL[] {
  const entries = Object.entries(counters)
    .filter(([, v]) => typeof v === 'number' && Number.isInteger(v) && v >= 0);
  const keys = entries.map(([k]) => k);
  const out: SQL[] = [];
  if (keys.length === 0) {
    out.push(sql`delete from public.achievement_counters where user_id = ${uid} and ${guard}`);
  } else {
    out.push(sql`delete from public.achievement_counters
      where user_id = ${uid} and key <> all(${textArray(keys)}) and ${guard}`);
    const setSql = counterSetFragment(guard, uid, counters);
    if (setSql) out.push(setSql);
  }
  return out;
}

/** 계정 정리에서 사용자의 카운터 행을 모두 지운다 */
export async function deleteUserCounters(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.achievement_counters where user_id = ${uid}`);
}
