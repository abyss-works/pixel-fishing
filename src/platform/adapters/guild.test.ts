// 길드 요청 — 보너스 기부는 보너스 경로에 기부액을 본문으로 보내고, 거부는 오류 코드로 돌려준다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { guildAction } from './guild';

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
});
