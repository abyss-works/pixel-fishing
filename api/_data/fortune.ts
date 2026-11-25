// 일일 운세 이력(daily_fortunes) 쓰기 소유 모듈.
// 로그인 계정의 게임 날짜별 운세를 멱등 저장하고, 주간 조회 범위의 이력을 최신순으로 읽는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { DailyFortune, FortuneKind } from '../../src/game/rules/fortune.js';

/** 로그인 계정의 당일 운세를 기록한다. 같은 계정·날짜가 이미 있으면 덮어쓰지 않는다 */
export async function recordDailyFortune(db: Executor, uid: string, fortune: DailyFortune): Promise<void> {
  await db.execute(sql`insert into public.daily_fortunes (user_id, day, kind, index)
    values (${uid}, ${fortune.day}, ${fortune.kind}, ${fortune.index})
    on conflict (user_id, day) do nothing`);
}

/** 기준 게임 날짜(sinceDay) 이후의 운세 이력을 최신 날짜 순으로 돌려준다 */
export async function loadFortuneHistory(db: Executor, uid: string, sinceDay: string): Promise<DailyFortune[]> {
  const { rows } = await db.execute<{ day: string; kind: FortuneKind; index: number }>(
    sql`select day, kind, index from public.daily_fortunes
      where user_id = ${uid} and day >= ${sinceDay}
      order by day desc`,
  );
  return rows.map(r => ({
    day: r.day,
    kind: r.kind,
    index: Number(r.index) as 3 | 5,
  }));
}

/** 계정 정리에서 사용자의 일일 운세 이력을 모두 지운다 */
export async function deleteUserFortunes(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.daily_fortunes where user_id = ${uid}`);
}
