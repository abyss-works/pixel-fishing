// 일일 운세 이력(daily_fortunes) 쓰기 소유 모듈.
// 로그인 계정의 게임 날짜별 운세를 멱등 저장하고, 월 단위 이력·최초 기록 월·오늘 운세를 읽는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { DailyFortune } from '../../src/game/rules/fortune.js';

export interface FortuneMonthData {
  firstMonth: string | null;
  today: DailyFortune | null;
  days: DailyFortune[];
}

/** 로그인 계정의 당일 운세를 기록한다. 같은 계정·날짜가 이미 있으면 덮어쓰지 않는다 */
export async function recordDailyFortune(db: Executor, uid: string, fortune: DailyFortune): Promise<void> {
  await db.execute(sql`insert into public.daily_fortunes (user_id, day, kind, index)
    values (${uid}, ${fortune.day}, ${fortune.kind}, ${fortune.index})
    on conflict (user_id, day) do nothing`);
}

/** 지정 월 구간([fromDay, toDay))의 일별 운세(오름차순), 최초 기록 월, 오늘(currentDay) 운세를 조회한다 */
export async function loadFortuneMonth(
  db: Executor,
  uid: string,
  fromDay: string,
  toDay: string,
  currentDay: string,
): Promise<FortuneMonthData> {
  const { rows } = await db.execute<{
    first_month: string | null;
    today: DailyFortune | null;
    days: DailyFortune[];
  }>(sql`select
    (select substr(min(day), 1, 7) from public.daily_fortunes where user_id = ${uid}) as first_month,
    (select json_build_object('day', day, 'kind', kind, 'index', index)
      from public.daily_fortunes
      where user_id = ${uid} and day = ${currentDay}) as today,
    (select coalesce(json_agg(json_build_object('day', day, 'kind', kind, 'index', index) order by day asc), '[]')
      from public.daily_fortunes
      where user_id = ${uid} and day >= ${fromDay} and day < ${toDay}) as days`);
  const row = rows[0];
  return {
    firstMonth: row.first_month,
    today: row.today ? { ...row.today, index: Number(row.today.index) as 3 | 5 } : null,
    days: row.days.map(d => ({ ...d, index: Number(d.index) as 3 | 5 })),
  };
}

/** 계정 정리에서 사용자의 일일 운세 이력을 모두 지운다 */
export async function deleteUserFortunes(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.daily_fortunes where user_id = ${uid}`);
}
