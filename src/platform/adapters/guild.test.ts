// 길드 요청 — 보너스 기부는 보너스 경로에 기부액을 본문으로 보내고, 거부는 오류 코드로 돌려준다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { guildAction, readGuild, readPublicGuilds } from './guild';

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

  it('GET /api/guilds/public은 검색어와 정렬을 쿼리로 싣고 joinMode를 포함한 목록을 돌려준다', async () => {
    const guilds = [
      { guildId: 'g1', name: '파도쉼터', level: 4, members: 3, cap: 10, joinMode: 'open', pitch: '같이 낚시해요!', lastActivityAt: '2026-11-26T00:00:00.000Z' },
      { guildId: 'g2', name: '승인선단', level: 2, members: 10, cap: 10, joinMode: 'approval', pitch: '나랑 같이 낚시하자!', lastActivityAt: '2026-11-25T00:00:00.000Z' },
    ];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ guilds }), { status: 200 }));
    await expect(readPublicGuilds({ q: ' 파도 ', sort: 'level' })).resolves.toEqual(guilds);
    expect(fetchMock).toHaveBeenCalledWith('/api/guilds/public?q=%ED%8C%8C%EB%8F%84&sort=level');
  });

  it('POST /api/guild-memberships { guildId }로 공개 길드에 바로 가입하거나 승인 가입 신청을 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g1', result: 'joined' }), { status: 201 }));
    await expect(guildAction({ op: 'joinPublic', guildId: 'g1' })).resolves.toEqual({ ok: true, result: 'joined' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/guild-memberships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guildId: 'g1' }),
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'g2', result: 'requested' }), { status: 202 }));
    await expect(guildAction({ op: 'joinPublic', guildId: 'g2' })).resolves.toEqual({ ok: true, result: 'requested' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/guild-memberships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guildId: 'g2' }),
    });
  });

  it('GET /api/guilds/me의 cooldownUntil을 그대로 반환하고 누락 시 null로 정규화한다', async () => {
    const until = '2026-11-28T00:00:00.000Z';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ guild: null, request: null, cooldownUntil: until }), { status: 200 }));
    await expect(readGuild()).resolves.toEqual({ guild: null, request: null, cooldownUntil: until });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ guild: null, request: null }), { status: 200 }));
    await expect(readGuild()).resolves.toEqual({ guild: null, request: null, cooldownUntil: null });
  });

  it('409 rejoin-cooldown 거부를 그대로 반환한다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'rejoin-cooldown' }), { status: 409 }));
    await expect(guildAction({ op: 'create', name: '새선단' }))
      .resolves.toEqual({ ok: false, error: 'rejoin-cooldown' });
  });
});
