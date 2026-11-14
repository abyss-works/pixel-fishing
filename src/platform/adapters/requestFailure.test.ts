import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';

vi.mock('./auth', () => ({ isCloud: true }));

import { isRateLimited, requestFailure } from './requestFailure';
import { readMe } from './me';
import { readFriends } from './friends';
import { readRanking } from './ranking';
import { friendAction } from './friends';
import { guildAction } from './guild';

const tooMany = () => new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '1' } });

afterEach(() => vi.unstubAllGlobals());

describe('requestFailure', () => {
  it('429는 본문 없이도 rate-limited로 분류한다', () => {
    const err = requestFailure(tooMany(), 'x failed');
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe('rate-limited');
    expect(err.context).toEqual({ status: 429 });
  });

  it.each([500, 502, 503, 404])('%i는 network로 남는다', status => {
    expect(requestFailure(new Response('x', { status }), 'x failed').kind).toBe('network');
  });

  it('isRateLimited는 429만 참이다', () => {
    expect(isRateLimited(tooMany())).toBe(true);
    expect(isRateLimited(new Response('', { status: 503 }))).toBe(false);
  });
});

describe('읽기 어댑터의 텍스트 본문 429', () => {
  it('본인 데이터 읽기', async () => {
    vi.stubGlobal('fetch', async () => tooMany());
    const err = await readMe('state').catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('친구 목록 읽기', async () => {
    vi.stubGlobal('fetch', async () => tooMany());
    const err = await readFriends().catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('랭킹 읽기', async () => {
    vi.stubGlobal('fetch', async () => tooMany());
    const err = await readRanking('gold' as never).catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('503은 network로 남는다', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 503 }));
    const err = await readMe('state').catch(e => e);
    expect((err as AppError).kind).toBe('network');
  });
});

describe('쓰기 어댑터의 429', () => {
  it('친구 액션: 코드 없는 텍스트 429는 rate-limited로 던진다', async () => {
    vi.stubGlobal('fetch', async () => tooMany());
    const err = await friendAction({ op: 'accept', uid: 'u1' }).catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('친구 액션: 오류 코드를 실은 JSON 429는 거절 값으로 돌려준다', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'rate-limited' }), { status: 429 }));
    await expect(friendAction({ op: 'accept', uid: 'u1' })).resolves.toEqual({ ok: false, error: 'rate-limited' });
  });

  it('길드 액션: 코드 없는 텍스트 429는 rate-limited로 던진다', async () => {
    vi.stubGlobal('fetch', async () => tooMany());
    const err = await guildAction({ op: 'join', code: 'ABCD2345' }).catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('길드 액션: 오류 코드를 실은 JSON 429는 거절 값으로 돌려준다', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'rate-limited' }), { status: 429 }));
    await expect(guildAction({ op: 'join', code: 'ABCD2345' })).resolves.toEqual({ ok: false, error: 'rate-limited' });
  });

  it('길드 액션: 503은 network로 던진다', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 503 }));
    const err = await guildAction({ op: 'join', code: 'ABCD2345' }).catch(e => e);
    expect((err as AppError).kind).toBe('network');
  });
});
