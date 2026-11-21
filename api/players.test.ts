// 공개 프로필 핸들러 단위 테스트 — DB 공개 프로필과 실시간 접속 상태(presenceOf) 결합을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile } from './_data/profile.js';
import { providePresence } from './_server/livePresence.js';

const s = vi.hoisted(() => ({
  session: { id: '00000000-0000-4000-8000-000000000001', email: 'me@example.com' } as { id: string; email: string | null } | null,
  profile: null as PublicProfile | null,
}));

vi.mock('./_auth/session.js', () => ({ sessionOf: vi.fn(async () => s.session) }));
vi.mock('./_db/client.js', () => ({ database: () => ({ db: {} }) }));
vi.mock('./_data/profile.js', () => ({ publicProfile: vi.fn(async () => s.profile) }));
vi.mock('./_data/friends.js', () => ({ searchAccounts: vi.fn(async () => []) }));

import handler from './players.js';

const TARGET = '00000000-0000-4000-8000-000000000002';

const baseProfile = (): PublicProfile => ({
  nickname: '갈치',
  boat: 4,
  rod: 12,
  fame: 5000,
  dexFish: ['crucian'],
  dexVariant: ['crucian'],
  artifacts: ['abyss-angler'],
  artifactLevels: { 'abyss-angler': 3 },
  hats: ['straw-hat'],
  look: { shirt: 1, pants: 2, hat: 'straw-hat' },
  achievements: ['variant-village'],
  location: { kind: 'base', id: 'harbor' },
  lastPos: { region: 'world', x: 100, y: 200 },
  account: true,
});

async function call(uid: string) {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await handler({ method: 'GET', params: { uid }, headers: {} } as never, res as never);
  return out;
}

describe('GET /api/players/:uid', () => {
  const prevDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://unit-test';
    s.session = { id: '00000000-0000-4000-8000-000000000001', email: 'me@example.com' };
    s.profile = baseProfile();
    providePresence(() => null);
  });

  afterEach(() => {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    providePresence(() => null);
  });

  it('접속 중인 플레이어는 online과 실시간 지역·해역을 함께 응답한다', async () => {
    providePresence(uid => (uid === TARGET
      ? { uid, nick: '갈치', boat: 4, region: 'world', zone: 'deep', x: 10, y: 20, dir: 0, line: false }
      : null));
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...baseProfile(),
      online: true,
      liveRegion: 'world',
      liveZone: 'deep',
    });
  });

  it('비접속 플레이어는 online: false와 liveRegion·liveZone null로 응답한다', async () => {
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...baseProfile(),
      online: false,
      liveRegion: null,
      liveZone: null,
    });
  });
});
