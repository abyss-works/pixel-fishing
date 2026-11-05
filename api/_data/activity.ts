// 활동 기록(play_sessions·user_active_days·daily_stats) 쓰기 소유 모듈.
// 접속 세션은 실시간 채널이 연결이 끝날 때, 활동일은 액션 확정의 후속 쓰기가, 일별 집계는 매일 예약 작업이 쓴다.
// 날짜는 모두 KST 하루 축이다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';

/** 이 시간 안에 같은 사람이 다시 연결하면(새로고침·재배포) 새 세션 대신 앞 세션을 늘린다 */
const SESSION_JOIN_GAP = sql`interval '2 minutes'`;

/**
 * 끝난 연결 하나를 세션으로 기록한다. 그 사용자의 직전 세션이 이 연결의 시작보다 2분 안쪽에서 끝났으면
 * 그 행의 끝 시각을 늘리고, 아니면 새 행을 넣는다. 길이는 이어 붙인 세션의 시작부터 끝까지다.
 */
export async function recordSession(db: Executor, uid: string, startedISO: string, endedISO: string): Promise<void> {
  const started = at(startedISO);
  const ended = at(endedISO);
  await db.execute(sql`with prev as (
      select id from public.play_sessions
      where user_id = ${uid} and started_at <= ${started} and ended_at >= ${started} - ${SESSION_JOIN_GAP}
      order by ended_at desc
      limit 1
      for update
    ),
    extended as (
      update public.play_sessions s
      set ended_at = greatest(s.ended_at, ${ended}),
          duration_sec = extract(epoch from greatest(s.ended_at, ${ended}) - s.started_at)::int
      from prev where s.id = prev.id
      returning s.id
    )
    insert into public.play_sessions (user_id, started_at, ended_at, duration_sec)
    select ${uid}, ${started}, ${ended}, extract(epoch from ${ended} - ${started})::int
    where not exists (select 1 from extended)`);
}

/** 액션을 처리한 KST 날짜를 그 사용자의 활동일로 남기는 문장. 이미 있으면 아무것도 하지 않는다 */
export function activeDayUpsert(uid: string, atISO: string): SQL {
  return sql`insert into public.user_active_days (user_id, day)
    values (${uid}, (${at(atISO)} at time zone 'Asia/Seoul')::date)
    on conflict do nothing`;
}

/** KST 날짜 열 식의 하루 범위 조건. 그날 KST 0시부터 다음 날 0시 전까지다 */
const onDay = (column: SQL, day: SQL): SQL =>
  sql`${column} >= (${day})::timestamp at time zone 'Asia/Seoul' and ${column} < (${day} + 1)::timestamp at time zone 'Asia/Seoul'`;

/**
 * 일별 집계를 갱신하고 계산한 날짜(오름차순)를 돌려준다. 콜드 아카이브가 events를 옮기기 전에 실행한다.
 * 먼저 남아 있는 events로 활동일을 채운다(관리자 조치 이벤트와 인증 계정이 없는 행은 뺀다).
 * 그다음 events가 남아 있는 KST 날짜 가운데 집계 행이 없거나 어제·오늘인 날을 다시 계산해 덮어쓴다.
 * events가 없는 날은 계산하지 않아 행이 없는 채로 남는다.
 * 골드 유입(sell·coupon·claimMail의 gold)과 유출(upgradeRod·buyBoat·buyBait의 cost)은 관리자 경제 일계와 같은 정의다.
 */
export async function refreshDailyStats(db: Executor, nowISO: string): Promise<string[]> {
  await db.execute(sql`insert into public.user_active_days (user_id, day)
    select distinct e.user_id, (e.created_at at time zone 'Asia/Seoul')::date
    from public.events e
    where e.type not like 'admin%' and exists (select 1 from auth.users u where u.id = e.user_id)
    on conflict do nothing`);
  const { rows } = await db.execute<{ day: string }>(sql`with today as (
      select (${at(nowISO)} at time zone 'Asia/Seoul')::date as d
    ),
    pick as (
      select distinct (e.created_at at time zone 'Asia/Seoul')::date as day
      from public.events e
    )
    insert into public.daily_stats (day, dau, new_users, new_accounts, sessions, session_minutes, median_session_minutes,
      catches, gold_in, gold_out, actions, computed_at)
    select p.day,
           (select count(*) from public.user_active_days a where a.day = p.day)::int,
           (select count(*) from auth.users u where ${onDay(sql`u.created_at`, sql`p.day`)})::int,
           (select count(*) from auth.users u where not u.is_anonymous and ${onDay(sql`u.created_at`, sql`p.day`)})::int,
           s.n, s.minutes, s.median,
           ev.catches, ev.gold_in, ev.gold_out, ev.actions,
           ${at(nowISO)}
    from pick p
    cross join today t
    cross join lateral (
      select count(*)::int as n,
             coalesce(round(sum(ps.duration_sec) / 60.0), 0)::int as minutes,
             round((percentile_cont(0.5) within group (order by ps.duration_sec))::numeric / 60, 1) as median
      from public.play_sessions ps
      where ${onDay(sql`ps.started_at`, sql`p.day`)}
    ) s
    cross join lateral (
      select count(*) filter (where e.type = 'catch')::int as catches,
             coalesce(sum((e.payload->>'gold')::numeric) filter (where e.type in ('sell', 'coupon', 'claimMail')), 0)::bigint as gold_in,
             coalesce(sum((e.payload->>'cost')::numeric) filter (where e.type in ('upgradeRod', 'buyBoat', 'buyBait')), 0)::bigint as gold_out,
             count(*) filter (where e.type not like 'admin%')::int as actions
      from public.events e
      where ${onDay(sql`e.created_at`, sql`p.day`)}
    ) ev
    where p.day >= t.d - 1 or not exists (select 1 from public.daily_stats d where d.day = p.day)
    on conflict (day) do update set
      dau = excluded.dau, new_users = excluded.new_users, new_accounts = excluded.new_accounts,
      sessions = excluded.sessions, session_minutes = excluded.session_minutes,
      median_session_minutes = excluded.median_session_minutes, catches = excluded.catches,
      gold_in = excluded.gold_in, gold_out = excluded.gold_out, actions = excluded.actions,
      computed_at = excluded.computed_at
    returning day::text as day`);
  return rows.map(r => r.day).sort();
}

/** 계정 정리에서 사용자의 세션과 활동일을 지운다. 일별 집계는 사용자 행이 아니라 남긴다 */
export async function deleteUserActivity(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.play_sessions where user_id = ${uid}`);
  await db.execute(sql`delete from public.user_active_days where user_id = ${uid}`);
}
