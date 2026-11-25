import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';

vi.mock('./auth', () => ({ isCloud: true }));

import {
  ConsentRequiredError,
  isConsentRequiredError,
  isRateLimited,
  readRequestFailure,
  requestFailure,
  subscribeConsentRequired,
  throwRequestFailure,
} from './requestFailure';
import { readMe } from './me';
import { markMailRead, readMails } from './mailbox';
import { friendAction, readFriends } from './friends';
import { guildAction, readGuild } from './guild';
import { readFortuneHistory } from './fortune';
import { readRanking } from './ranking';
import { readAwayReport } from './away';
import { readPlayer, searchPlayers } from './player';
import { readLastPosition } from './position';

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

  it('403 consent-required 코드는 ConsentRequiredError로 구분하고 다른 403은 network로 남는다', async () => {
    const err = requestFailure(new Response('', { status: 403 }), 'x failed', 'consent-required');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ConsentRequiredError);
    expect(err.kind).toBe('consent-required');
    expect(isConsentRequiredError(err)).toBe(true);
    expect(err.context).toEqual({ status: 403, code: 'consent-required' });

    const plain = requestFailure(new Response('', { status: 403 }), 'x failed');
    expect(plain.kind).toBe('network');
    expect(isConsentRequiredError(plain)).toBe(false);

    const fromRes = await readRequestFailure(
      new Response(JSON.stringify({ error: 'consent-required' }), { status: 403 }),
      'x failed',
    );
    expect(isConsentRequiredError(fromRes)).toBe(true);
  });
});

describe('readMe의 403 consent-required 처리', () => {
  it('403 consent-required 본문을 받으면 ConsentRequiredError를 던지고 구독자에 알린다', async () => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'consent-required' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }));
    try {
      const err = await readMe('state').catch(e => e);
      expect((err as AppError).kind).toBe('consent-required');
      expect(isConsentRequiredError(err)).toBe(true);
      expect(onConsent).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('consent-required가 아닌 403은 network로 던지고 알림을 보내지 않는다', async () => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    try {
      const err = await readMe('state').catch(e => e);
      expect(isConsentRequiredError(err)).toBe(false);
      expect((err as AppError).kind).toBe('network');
      expect(onConsent).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('throwRequestFailure는 403 consent-required 시 알림을 보내고 ConsentRequiredError를 던진다', async () => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    try {
      const err = await throwRequestFailure(
        new Response(JSON.stringify({ error: 'consent-required' }), { status: 403 }),
        'x failed',
      ).catch(e => e);
      expect((err as AppError).kind).toBe('consent-required');
      expect(isConsentRequiredError(err)).toBe(true);
      expect(onConsent).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });
});

describe('어댑터별 403 consent-required 일관 처리', () => {
  const consentRes = () => new Response(JSON.stringify({ error: 'consent-required' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });

  it.each([
    ['readMails', () => readMails()],
    ['markMailRead', () => markMailRead(1)],
    ['readFriends', () => readFriends()],
    ['friendAction', () => friendAction({ op: 'accept', uid: 'u1' })],
    ['readGuild', () => readGuild()],
    ['guildAction', () => guildAction({ op: 'join', code: 'ABCD2345' })],
    ['readFortuneHistory', () => readFortuneHistory('2026-11')],
    ['readRanking', () => readRanking('fame')],
    ['readAwayReport', () => readAwayReport(1000)],
    ['readPlayer', () => readPlayer('u1')],
    ['searchPlayers', () => searchPlayers('가')],
    ['readLastPosition', () => readLastPosition()],
  ] as const)('%s가 403 consent-required를 받으면 ConsentRequiredError를 던지고 구독자에 알린다', async (_name, invoke) => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    vi.stubGlobal('fetch', async () => consentRes());
    try {
      const err = await invoke().catch(e => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).kind).toBe('consent-required');
      expect(isConsentRequiredError(err)).toBe(true);
      expect(onConsent).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
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
