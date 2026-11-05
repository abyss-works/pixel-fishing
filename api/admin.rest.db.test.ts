// 관리자 리소스 경로 조회(접속 목록, 일별 집계, 가입일 리텐션, 접속 세션)를 실제 Postgres에서 검사한다.
// 관리자 판정과 캐시 금지는 이름 조회(?q=)와 같다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSessionHeaders, seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { provideOnline } from './_server/livePresence.js';

const ADMIN = testUid(951);
const PLAYER = testUid(952);
const GUEST = testUid(953);

type Row = Record<string, unknown>;
interface Out { status: number; body: unknown; headers: Record<string, string> }

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ADMIN, email: 'admin@example.test', nickname: '운영' });
  await seedUser(env.client, { uid: PLAYER, email: 'player@example.test', nickname: '플레이어' });
  await seedUser(env.client, { uid: GUEST, nickname: null });
  await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
});
afterAll(async () => {
  provideOnline(() => []);
  await env?.stop();
});

async function call(url: string, token: string | null = userToken(ADMIN), method = 'GET',
  headers: (token: string | null) => Record<string, string> = adminSessionHeaders): Promise<Out> {
  const { default: handler } = await import('./admin.js');
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  const query = Object.fromEntries(new URL(url, 'http://x').searchParams);
  await handler({ method, url, query, headers: headers(token) } as never, res as never);
  return out;
}

/** DB 시계 기준 KST 오늘에서 offset일 더한 날짜 */
async function kstDay(offset = 0): Promise<string> {
  const { rows } = await env.client.query(`select ((now() at time zone 'Asia/Seoul')::date + $1::int)::text as d`, [offset]);
  return rows[0].d as string;
}

const PATHS = ['/api/admin/live', '/api/admin/stats/daily', '/api/admin/retention', '/api/admin/sessions'];

describe('요청 검증과 관리자 판정', () => {
  it('세션이 없으면 401, 관리자가 아니면 403이고 데이터를 받지 못한다. 모든 응답은 캐시하지 않는다', async () => {
    for (const path of PATHS) {
      const none = await call(path, null);
      expect(none, path).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
      const player = await call(path, userToken(PLAYER));
      expect(player, path).toMatchObject({ status: 403 });
      expect(player.body, path).toEqual({ error: 'forbidden' });
      for (const res of [none, player, await call(path)]) expect(res.headers['cache-control'], path).toBe('private, no-store');
    }
  });

  it('게임 세션 쿠키로는 관리자 계정이라도 401이다', async () => {
    for (const path of PATHS) {
      expect(await call(path, userToken(ADMIN), 'GET', sessionHeaders), path).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    }
  });

  it('GET 외 메서드는 405, 없는 리소스는 404다', async () => {
    expect(await call('/api/admin/sessions', userToken(ADMIN), 'POST')).toMatchObject({ status: 405, body: { error: 'method-not-allowed' } });
    expect(await call('/api/admin/nope')).toMatchObject({ status: 404, body: { error: 'not-found' } });
  });

  it('끝의 빗금은 같은 리소스다', async () => {
    expect((await call('/api/admin/retention/')).status).toBe(200);
  });
});

describe('GET /api/admin/live', () => {
  it('허브의 접속 목록과 수를 준다. 허브가 없으면 빈 목록이다', async () => {
    expect((await call('/api/admin/live')).body).toEqual({ count: 0, online: [] });
    const online = [
      { uid: PLAYER, nick: '플레이어', region: 'sea', zone: 'pacific', connectedAt: '2030-01-01T00:00:00.000Z', guest: false },
      { uid: GUEST, nick: '낚시꾼', region: null, zone: null, connectedAt: '2030-01-01T00:01:00.000Z', guest: true },
    ];
    provideOnline(() => online);
    expect(await call('/api/admin/live')).toMatchObject({ status: 200, body: { count: 2, online } });
  });
});

describe('GET /api/admin/stats/daily', () => {
  const stat = (day: string, dau: number) => env.client.query(`insert into public.daily_stats
    (day, dau, new_users, new_accounts, sessions, session_minutes, median_session_minutes, catches, gold_in, gold_out, actions)
    values ($1, $2, 3, 1, 4, 50, 12.5, 7, 9000000000, 20, 30)`, [day, dau]);

  beforeAll(async () => {
    await stat(await kstDay(0), 5);
    await stat(await kstDay(-29), 6);
    await stat(await kstDay(-30), 7);
    await stat('2030-01-01', 8);
    await env.client.query(`insert into public.daily_stats
      (day, dau, new_users, new_accounts, sessions, session_minutes, median_session_minutes, catches, gold_in, gold_out, actions)
      values ('2030-01-03', 1, 0, 0, 0, 0, null, 0, 0, 0, 2)`);
  });

  it('기본 기간은 KST 오늘까지 30일이고 날짜 오름차순이다', async () => {
    const res = await call('/api/admin/stats/daily');
    expect(res.status).toBe(200);
    expect((res.body as Row[]).map(r => [r.day, r.dau])).toEqual([[await kstDay(-29), 6], [await kstDay(0), 5]]);
    expect((res.body as Row[])[1]).toEqual({
      day: await kstDay(0), dau: 5, newUsers: 3, newAccounts: 1, sessions: 4, sessionMinutes: 50, medianSessionMinutes: 12.5,
      catches: 7, goldIn: 9000000000, goldOut: 20, actions: 30,
    });
  });

  it('from·to는 양끝을 포함하고, 집계되지 않은 날은 행이 없다. 세션이 없는 날의 중앙값은 null이다', async () => {
    const rows = (await call('/api/admin/stats/daily?from=2030-01-01&to=2030-01-05')).body as Row[];
    expect(rows.map(r => r.day)).toEqual(['2030-01-01', '2030-01-03']);
    expect(rows[1].medianSessionMinutes).toBeNull();
    expect(((await call('/api/admin/stats/daily?from=2030-01-02&to=2030-01-03')).body as Row[]).map(r => r.day)).toEqual(['2030-01-03']);
  });

  it('from만 주면 오늘까지, to만 주면 to까지 30일이다', async () => {
    expect(((await call(`/api/admin/stats/daily?from=${await kstDay(-30)}`)).body as Row[]).map(r => r.dau)).toEqual([7, 6, 5]);
    expect(((await call('/api/admin/stats/daily?to=2030-01-31')).body as Row[]).map(r => r.day)).toEqual(['2030-01-03']);
  });

  it('기간은 180일까지이고, 날짜 형식이 틀리거나 순서가 뒤집히면 400이다', async () => {
    expect((await call('/api/admin/stats/daily?from=2030-01-01&to=2030-06-29')).status).toBe(200);
    for (const [query, error] of [
      ['from=2030-01-01&to=2030-06-30', 'bad-range'], ['from=2030-01-02&to=2030-01-01', 'bad-range'],
      ['from=2030-02-30', 'bad-date'], ['from=2030-1-1', 'bad-date'], ['to=abc', 'bad-date'], ['from=', 'bad-date'],
    ]) {
      expect(await call(`/api/admin/stats/daily?${query}`), query).toMatchObject({ status: 400, body: { error } });
    }
  });
});

describe('GET /api/admin/retention', () => {
  it('최근 60일 가입일 코호트별 D1·D7·D30 비율을 최신 코호트부터 주고, 아직 오지 않은 날은 null이다', async () => {
    const user = async (n: number, createdDaysAgo: number, activeAfter: number[]) => {
      const uid = await seedUser(env.client, { uid: testUid(n), nickname: null });
      await env.client.query(`update auth.users set created_at = now() - make_interval(days => $2) where id = $1`, [uid, createdDaysAgo]);
      for (const after of activeAfter) {
        await env.client.query(`insert into public.user_active_days (user_id, day)
          values ($1, ((now() - make_interval(days => $2)) at time zone 'Asia/Seoul')::date + $3::int)`, [uid, createdDaysAgo, after]);
      }
    };
    // 기존 사용자는 오늘 가입했다. 8일 전 코호트는 둘 중 하나가 다음 날, 둘 다 7일 뒤에 돌아왔다
    await user(961, 8, [1, 7]);
    await user(962, 8, [7]);
    await user(963, 40, [1, 30]);
    await user(964, 60, [1]);
    const rows = (await call('/api/admin/retention')).body as Row[];
    expect(rows).toEqual([
      { day: await kstDay(0), size: 3, d1: null, d7: null, d30: null },
      { day: await kstDay(-8), size: 2, d1: 0.5, d7: 1, d30: null },
      { day: await kstDay(-40), size: 1, d1: 1, d7: 0, d30: 1 },
    ]);
  });
});

describe('GET /api/admin/sessions와 명부의 세션 열', () => {
  beforeAll(async () => {
    await env.client.query(`insert into public.play_sessions (user_id, started_at, ended_at, duration_sec) values
      ($1, '2030-01-01T00:00:00Z', '2030-01-01T00:10:00Z', 600),
      ($2, '2030-01-01T01:00:00Z', '2030-01-01T01:00:30Z', 30),
      ($1, '2030-01-02T00:00:00Z', '2030-01-02T00:20:00Z', 1200)`, [PLAYER, GUEST]);
  });

  it('시작이 늦은 순으로 닉네임과 함께 준다. 사용자를 주면 그 사람의 세션만 준다', async () => {
    const all = (await call('/api/admin/sessions')).body as Row[];
    expect(all.map(r => [r.userId, r.durationSec])).toEqual([[PLAYER, 1200], [GUEST, 30], [PLAYER, 600]]);
    expect(all[0]).toEqual({ id: expect.any(Number), userId: PLAYER, nick: '플레이어',
      startedAt: '2030-01-02T00:00:00+00:00', endedAt: '2030-01-02T00:20:00+00:00', durationSec: 1200 });
    expect(all[1].nick).toBeNull();
    const mine = (await call(`/api/admin/sessions?user=${PLAYER}&limit=1`)).body as Row[];
    expect(mine.map(r => r.durationSec)).toEqual([1200]);
  });

  it('건수는 1~500으로 맞추고, 사용자 id나 건수 형식이 틀리면 400이다', async () => {
    expect(((await call('/api/admin/sessions?limit=0')).body as Row[])).toHaveLength(1);
    expect(((await call('/api/admin/sessions?limit=999999')).body as Row[])).toHaveLength(3);
    expect(await call('/api/admin/sessions?user=nope')).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await call('/api/admin/sessions?limit=x')).toMatchObject({ status: 400, body: { error: 'bad-limit' } });
  });

  it('명부는 사용자별 마지막 세션 종료 시각과 누적 세션 시간(초)을 싣는다. 세션이 없으면 null과 0이다', async () => {
    const rows = (await call('/api/admin?q=users')).body as Row[];
    const of = (uid: string) => rows.find(r => r.user_id === uid);
    expect(of(PLAYER)).toMatchObject({ last_session_at: '2030-01-02T00:20:00+00:00', total_session_sec: 1800 });
    expect(of(GUEST)).toMatchObject({ last_session_at: '2030-01-01T01:00:30+00:00', total_session_sec: 30 });
    expect(of(ADMIN)).toMatchObject({ last_session_at: null, total_session_sec: 0 });
  });
});
