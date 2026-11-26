// 길드 요청 — 보너스 기부는 보너스 경로에 기부액을 본문으로 보내고, 거부는 오류 코드로 돌려준다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { guildAction, readPublicGuilds } from './guild';

describe('guildAction — 보너스 기부', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POST /api/guilds/:id/bonuses/:bonus/donations { amount }', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rank: 2, pool: 0, accepted: 150_000, gold: 0 }), { status: 201 }));
    await expect(guildAction({ op: 'donate', guildId: 'g1', bonus: 'sell', amount: 150_000 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/guilds/g1/bonuses/sell/donations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 150_000 }),
    });
  });

  it('POST /api/guild-memberships { code }는 링크로 온 요청에만 via를 싣는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'g1', result: 'joined' }), { status: 201 }));
    await guildAction({ op: 'join', code: 'ABCD2345' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/guild-memberships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'ABCD2345' }),
    });
    await guildAction({ op: 'join', code: 'ABCD2345', via: 'link' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/guild-memberships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'ABCD2345', via: 'link' }),
    });
  });

  it('PUT /api/guilds/:id/name { name }', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: '새바다', gold: 0 }), { status: 200 }));
    await expect(guildAction({ op: 'rename', guildId: 'g1', name: '새바다' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/guilds/g1/name', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '새바다' }),
    });
  });

  it('거부는 서버 오류 코드로 돌려준다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'not-enough-gold' }), { status: 409 }));
    await expect(guildAction({ op: 'donate', guildId: 'g1', bonus: 'bag', amount: 1 }))
      .resolves.toEqual({ ok: false, error: 'not-enough-gold' });
  });

  it('POST /api/guilds/:id/enhancements/reset은 잔여 골드·회수 포인트·누적 초기화 횟수를 돌려준다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ gold: 400_000, recovered: 3, enhanceResetCount: 2 }), { status: 200 }));
    await expect(guildAction({ op: 'resetEnhancements', guildId: 'g1' }))
      .resolves.toEqual({ ok: true, gold: 400_000, recovered: 3, enhanceResetCount: 2 });
    expect(fetchMock).toHaveBeenCalledWith('/api/guilds/g1/enhancements/reset', { method: 'POST' });
  });

  it('GET /api/guilds/public은 검색어와 정렬을 쿼리로 싣고 목록을 돌려준다', async () => {
    const guilds = [{ guildId: 'g1', name: '파도쉼터', level: 4, members: 3, cap: 10, pitch: '같이 낚시해요!', lastActivityAt: '2026-11-26T00:00:00.000Z' }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ guilds }), { status: 200 }));
    await expect(readPublicGuilds({ q: ' 파도 ', sort: 'level' })).resolves.toEqual(guilds);
    expect(fetchMock).toHaveBeenCalledWith('/api/guilds/public?q=%ED%8C%8C%EB%8F%84&sort=level');
  });

  it('POST /api/guild-memberships { guildId }로 공개 길드에 바로 가입한다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'g1', result: 'joined' }), { status: 201 }));
    await expect(guildAction({ op: 'joinPublic', guildId: 'g1' })).resolves.toEqual({ ok: true, result: 'joined' });
    expect(fetchMock).toHaveBeenCalledWith('/api/guild-memberships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guildId: 'g1' }),
    });
  });
});
