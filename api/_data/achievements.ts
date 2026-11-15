// 업적 카운터 표(achievement_counters) 쓰기·읽기 소유 모듈.
// 액션 확정 문장 안에서 상태 변경과 원자적으로 함께 오르는 쓰기 조각과,
// 초기 상태·액션 컨텍스트가 읽는 사용자별 카운터 누적을 둔다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { AchievementCounters } from '../../src/game/content/achievements.js';
import { jsonParam } from './json.js';

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

/** 계정 정리에서 사용자의 카운터 행을 모두 지운다 */
export async function deleteUserCounters(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.achievement_counters where user_id = ${uid}`);
}
