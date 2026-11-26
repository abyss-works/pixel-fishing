// 일일 운세 이력(daily_fortunes) 쓰기 소유 모듈.
// 로그인 계정의 게임 날짜별 운세를 멱등 저장하고, 월 단위 이력·최초 기록 월·오늘 운세를 읽는다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { fortuneScoreOf } from '../../src/game/rules/fortune.js';
import type { DailyFortune, FortuneKind } from '../../src/game/rules/fortune.js';

export interface FortuneDiscoveredEntry {
  kind: FortuneKind;
  index: 3 | 5;
  count: number;
  firstDay: string;
}

export interface FortuneMonthData {
  firstMonth: string | null;
  today: DailyFortune | null;
  days: DailyFortune[];
  discovered: FortuneDiscoveredEntry[];
}

type RawDailyFortuneRow = {
  day: string;
  kind: FortuneKind;
  index: number;
  score: number | null;
};

function normalizeFortuneRow(r: RawDailyFortuneRow): DailyFortune & { score: number } {
  const index = Number(r.index) as 3 | 5;
  const score = fortuneScoreOf({
    day: r.day,
    kind: r.kind,
    index,
    score: typeof r.score === 'number' ? r.score : undefined,
  });
  return { day: r.day, kind: r.kind, index, score };
}

/** 확정 가드와 함께 로그인 계정의 당일 운세를 기록한다. 같은 계정·날짜가 이미 있으면 덮어쓰지 않는다 */
export function recordDailyFortuneFragment(guard: SQL, uid: string, fortune: DailyFortune): SQL {
  const score = fortuneScoreOf(fortune);
  return sql`insert into public.daily_fortunes (user_id, day, kind, index, score)
    select ${uid}, ${fortune.day}, ${fortune.kind}, ${fortune.index}, ${score}
    where ${guard}
    on conflict (user_id, day) do nothing`;
}

/** 개발 도구 fortune.set 전용 — 확정 가드와 함께 로그인 계정의 당일 운세 이력을 덮어써서 저장한다 */
export function upsertDailyFortuneFragment(guard: SQL, uid: string, fortune: DailyFortune): SQL {
  const score = fortuneScoreOf(fortune);
  return sql`insert into public.daily_fortunes (user_id, day, kind, index, score)
    select ${uid}, ${fortune.day}, ${fortune.kind}, ${fortune.index}, ${score}
    where ${guard}
    on conflict (user_id, day) do update set kind = excluded.kind, index = excluded.index, score = excluded.score`;
}

/** 지정 월 구간([fromDay, toDay), 상한 null이면 9999-12-31 이하)의 일별 운세(오름차순), 최초 기록 월, 오늘(currentDay) 운세, 전체 누적 발견 집계를 조회한다 */
export async function loadFortuneMonth(
  db: Executor,
  uid: string,
  fromDay: string,
  toDay: string | null,
  currentDay: string,
): Promise<FortuneMonthData> {
  const monthFilter = toDay === null
    ? sql`day >= ${fromDay} and day <= '9999-12-31'`
    : sql`day >= ${fromDay} and day < ${toDay}`;
  const { rows } = await db.execute<{
    first_month: string | null;
    today: RawDailyFortuneRow | null;
    days: RawDailyFortuneRow[];
    discovered: FortuneDiscoveredEntry[];
  }>(sql`select
    (select substr(min(day), 1, 7) from public.daily_fortunes where user_id = ${uid}) as first_month,
    (select json_build_object('day', day, 'kind', kind, 'index', index, 'score', score)
      from public.daily_fortunes
      where user_id = ${uid} and day = ${currentDay}) as today,
    (select coalesce(json_agg(json_build_object('day', day, 'kind', kind, 'index', index, 'score', score) order by day asc), '[]')
      from public.daily_fortunes
      where user_id = ${uid} and ${monthFilter}) as days,
    (select coalesce(json_agg(json_build_object('kind', kind, 'index', index, 'count', cnt, 'firstDay', first_day)
        order by first_day asc, kind asc, index asc), '[]')
      from (
        select kind, index, count(*)::int as cnt, min(day) as first_day
        from public.daily_fortunes
        where user_id = ${uid}
        group by kind, index
      ) d) as discovered`);
  const row = rows[0];
  return {
    firstMonth: row.first_month,
    today: row.today ? normalizeFortuneRow(row.today) : null,
    days: row.days.map(normalizeFortuneRow),
    discovered: row.discovered.map(d => ({
      kind: d.kind,
      index: Number(d.index) as 3 | 5,
      count: Number(d.count),
      firstDay: d.firstDay,
    })),
  };
}

/** 계정 정리에서 사용자의 일일 운세 이력을 모두 지운다 */
export async function deleteUserFortunes(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.daily_fortunes where user_id = ${uid}`);
}
