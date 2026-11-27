// 동적 쿠폰 확장·한도·기간·동시성·계정 삭제를 실제 Postgres에서 검증한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPONS } from '../../src/game/content/coupons.js';
import { callAction, captureRealClock, seedUser, startActionEnv, testUid, userToken } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import {
  consumeCoupon,
  createAdminCoupon,
  deleteAdminCoupon,
  deleteUserCouponRedemptions,
  findCoupon,
  listAdminCoupons,
  updateAdminCoupon,
} from './codes.js';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';

const NOW = '2030-03-06T05:00:00.000Z';
let env: ActionEnv;
let database: Database;
let nextUid = 2101;

beforeAll(async () => {
  env = await startActionEnv();
  database = createDatabase({ connectionString: env.db.url, max: 4 });
});
afterAll(async () => {
  await database?.pool.end();
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

const seedMember = (gold = 0) =>
  seedUser(env.client, { uid: testUid(nextUid++), email: `codes-${nextUid}@example.test`, state: { gold } });

const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);

describe('동적 쿠폰 확장 (items, 기간, 한도, 동시성)', () => {
  it('items 첨부·0골드 사료 쿠폰을 지급하고 정적 출항준비와 구분한다', async () => {
    const created = await createAdminCoupon(database.db, {
      code: 'FEED-SET-1',
      gold: 0,
      items: [{ id: 'luck-small', qty: 1 }, { id: 'cook-lunch-bite', qty: 1 }, { id: 'cook-bait-rare', qty: 3 }],
      description: '1회차 소통방 사료',
      active: true,
      startsAt: '2030-03-06T00:00:00.000Z',
      endsAt: '2030-03-07T00:00:00.000Z',
      maxRedemptions: 10,
      perAccountLimit: 1,
    });
    expect(created).not.toBe('duplicate');

    const found = await findCoupon(database.db, 'FEED-SET-1', NOW);
    expect(found).toMatchObject({
      gold: 0,
      items: [{ id: 'luck-small', qty: 1 }, { id: 'cook-lunch-bite', qty: 1 }, { id: 'cook-bait-rare', qty: 3 }],
      desc: '1회차 소통방 사료',
      maxRedemptions: 10,
      perAccountLimit: 1,
    });

    const uid = await seedMember(50);
    const res = await callAction(userToken(uid), { type: 'redeemCoupon', code: 'FEED-SET-1' });
    expect(res.status).toBe(200);
    expect((res.body as { result: unknown }).result).toEqual({
      type: 'coupon',
      gold: 0,
      items: [{ id: 'luck-small', qty: 1 }, { id: 'cook-lunch-bite', qty: 1 }, { id: 'cook-bait-rare', qty: 3 }],
      desc: '1회차 소통방 사료',
    });

    const { rows } = await env.client.query<{ gold: string; data: { items: Record<string, number> } }>(
      'select gold, data from public.saves_current where user_id = $1',
      [uid],
    );
    expect(Number(rows[0].gold)).toBe(50);
    expect(rows[0].data.items).toEqual({ 'luck-small': 1, 'cook-lunch-bite': 1, 'cook-bait-rare': 3 });

    const redemptions = await env.client.query<{ n: number }>(
      'select count(*)::int as n from public.coupon_redemptions where code = $1 and user_id = $2',
      ['FEED-SET-1', uid],
    );
    expect(redemptions.rows[0].n).toBe(1);

    // 정적 출항준비도 여전히 동작한다
    await rewind(uid);
    const starter = await callAction(userToken(uid), { type: 'redeemCoupon', code: '출항준비' });
    expect(starter.status).toBe(200);
    expect((starter.body as { result: { gold: number } }).result.gold).toBe(COUPONS['출항준비'].gold);
  });

  it('starts_at 이전과 ends_at 이상에서는 findCoupon과 redeemCoupon이 거부한다', async () => {
    await createAdminCoupon(database.db, {
      code: 'WINDOW-TEST',
      gold: 100,
      items: [],
      description: '기간 한정',
      active: true,
      startsAt: '2030-03-06T06:00:00.000Z',
      endsAt: '2030-03-06T08:00:00.000Z',
      maxRedemptions: null,
      perAccountLimit: 1,
    });
    const uid = await seedMember();
    expect(await findCoupon(database.db, 'WINDOW-TEST', NOW)).toBeNull();
    expect(await callAction(userToken(uid), { type: 'redeemCoupon', code: 'WINDOW-TEST' }))
      .toMatchObject({ status: 422, body: { error: 'coupon-invalid' } });

    vi.setSystemTime(new Date('2030-03-06T08:00:00.000Z'));
    expect(await findCoupon(database.db, 'WINDOW-TEST', '2030-03-06T08:00:00.000Z')).toBeNull();
    await rewind(uid);
    expect(await callAction(userToken(uid), { type: 'redeemCoupon', code: 'WINDOW-TEST' }))
      .toMatchObject({ status: 422, body: { error: 'coupon-invalid' } });
  });

  it('max_redemptions=2 동시 요청에서 정확히 2명만 성공하고 나머지는 거부된다', async () => {
    await createAdminCoupon(database.db, {
      code: 'LIMITED-2',
      gold: 500,
      items: [],
      description: '선착순 2명',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 2,
      perAccountLimit: 1,
    });

    const users = await Promise.all([seedMember(), seedMember(), seedMember(), seedMember(), seedMember()]);
    const results = await Promise.all(
      users.map(uid => callAction(userToken(uid), { type: 'redeemCoupon', code: 'LIMITED-2' })),
    );
    const okCount = results.filter(r => r.status === 200).length;
    const failCount = results.filter(r => r.status === 422).length;
    expect(okCount).toBe(2);
    expect(failCount).toBe(3);

    const { rows } = await env.client.query<{ n: number }>(
      'select count(*)::int as n from public.coupon_redemptions where code = $1',
      ['LIMITED-2'],
    );
    expect(rows[0].n).toBe(2);
  });

  it('per_account_limit=2이면 같은 계정이 2회까지 받고 3회째는 coupon-used로 거부된다', async () => {
    await createAdminCoupon(database.db, {
      code: 'MULTI-USE-2',
      gold: 250,
      items: [],
      description: '계정당 2회',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 10,
      perAccountLimit: 2,
    });
    const uid = await seedMember();
    expect((await callAction(userToken(uid), { type: 'redeemCoupon', code: 'MULTI-USE-2' })).status).toBe(200);
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'redeemCoupon', code: 'MULTI-USE-2' })).status).toBe(200);
    await rewind(uid);
    expect(await callAction(userToken(uid), { type: 'redeemCoupon', code: 'MULTI-USE-2' }))
      .toMatchObject({ status: 422, body: { error: 'coupon-used' } });

    const { rows } = await env.client.query<{ gold: string }>(
      'select gold from public.saves_current where user_id = $1',
      [uid],
    );
    expect(Number(rows[0].gold)).toBe(500);
  });

  it('consumeCoupon·관리자 CRUD·deleteUserCouponRedemptions가 정상 동작한다', async () => {
    const uid = await seedMember();
    await createAdminCoupon(database.db, {
      code: 'ADMIN-COUPON',
      gold: 100,
      items: [{ id: 'luck-small', qty: 1 }],
      description: '초기',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 5,
      perAccountLimit: 1,
    });
    expect(await createAdminCoupon(database.db, {
      code: 'ADMIN-COUPON',
      gold: 100,
      items: [],
      description: '중복',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
    })).toBe('duplicate');

    const updated = await updateAdminCoupon(database.db, {
      code: 'ADMIN-COUPON',
      gold: 300,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '수정됨',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 3,
      perAccountLimit: 1,
    });
    expect(updated).toMatchObject({ code: 'ADMIN-COUPON', gold: 300, description: '수정됨', maxRedemptions: 3 });

    expect(await consumeCoupon(database.db, 'ADMIN-COUPON', uid, NOW)).toBe('ok');
    expect(await consumeCoupon(database.db, 'ADMIN-COUPON', uid, NOW)).toBe('used');

    const list = await listAdminCoupons(database.db);
    expect(list.find(c => c.code === 'ADMIN-COUPON')?.redeemedCount).toBe(1);

    await deleteUserCouponRedemptions(database.db, uid);
    const { rows } = await env.client.query<{ n: number }>(
      'select count(*)::int as n from public.coupon_redemptions where user_id = $1',
      [uid],
    );
    expect(rows[0].n).toBe(0);

    expect(await deleteAdminCoupon(database.db, 'ADMIN-COUPON')).toBe(true);
    expect(await deleteAdminCoupon(database.db, 'ADMIN-COUPON')).toBe(false);
  });
});
