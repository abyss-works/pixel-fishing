// 서버의 403(제재 계정, 권한 없는 import 요청)은 거부 사유 코드와 무관하게 restricted 실패로 올라간다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';

vi.mock('./auth', () => ({ isCloud: true }));
const me = vi.hoisted(() => ({
  value: null as unknown,
  fn: null as ((kind: string) => Promise<unknown>) | null,
  calls: 0,
}));
vi.mock('./me', () => ({
  readMe: async (kind: string) => {
    me.calls++;
    return me.fn ? me.fn(kind) : me.value;
  },
}));

import { newState } from '../../game/rules/logic';
import { pickScalars } from '../../game/rules/actions';
import type { StatePatch } from '../../game/rules/actions';
import { HttpGameGateway } from './httpGameGateway';

afterEach(() => { vi.unstubAllGlobals(); me.value = null; me.fn = null; me.calls = 0; });

describe('HttpGameGateway의 import 거부', () => {
  it.each(['import-owner-only', 'import-disabled'])('403 %s는 restricted 실패로 던진다', async code => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: code }), {
      status: 403, headers: { 'content-type': 'application/json' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'import', save: {} }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('restricted');
  });
});

describe('HttpGameGateway의 요청 한도 응답', () => {
  it('본문이 JSON이 아닌 429도 rate-limited 실패로 던진다', async () => {
    vi.stubGlobal('fetch', async () => new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '1' } }));
    const err = await new HttpGameGateway().dispatch({ type: 'import', save: {} }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('앱 서버의 JSON 429(too-fast)도 rate-limited 실패로 던진다', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'too-fast' }), {
      status: 429, headers: { 'content-type': 'application/json' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'import', save: {} }).catch(e => e);
    expect((err as AppError).kind).toBe('rate-limited');
  });

  it('JSON이 아닌 502는 server 실패로 남는다', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));
    const err = await new HttpGameGateway().dispatch({ type: 'import', save: {} }).catch(e => e);
    expect((err as AppError).kind).toBe('server');
  });
});

describe('HttpGameGateway의 프로필 읽기', () => {
  it('닉네임과 개발 도구 판정을 서버 응답 그대로 돌려준다', async () => {
    me.value = { nickname: '나', devTools: true };
    expect(await new HttpGameGateway().getProfile()).toEqual({ nickname: '나', devTools: true });
  });

  it('판정 필드가 참이 아니면 닫힌 것으로 본다', async () => {
    for (const devTools of [false, undefined, 'true', 1, null]) {
      me.value = { nickname: '나', devTools };
      expect(await new HttpGameGateway().getProfile()).toEqual({ nickname: '나', devTools: false });
    }
  });

  it('읽기에 실패하면 이름 없음과 닫힘이다', async () => {
    me.value = null;
    expect(await new HttpGameGateway().getProfile()).toEqual({ nickname: null, devTools: false });
  });
});

describe('HttpGameGateway의 게스트 거부', () => {
  it.each([['guest-village-only'], ['account-only']] as const)('403 %s는 같은 이름의 실패 종류로 던진다', async code => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: code }), {
      status: 403, headers: { 'content-type': 'application/json' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe(code);
  });
});

describe('HttpGameGateway의 기운 저장 단위 이관', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const serverSave = (v: number, energy: number) => ({
    cur: { data: { v, items: { 'energy-common': energy } }, gold: 0, fame: 0, boat: 0, rod: 1, version: 4 },
    instances: [], records: [], legacy: null,
  });

  it.each([[9, 3, 30], [10, 30, 30]])('저장 버전 %i의 기운 %i은 불러올 때 저장 단위 %i로 한 번만 옮겨진다', async (v, raw, stored) => {
    me.value = serverSave(v, raw);
    const state = await new HttpGameGateway().load();
    expect(state?.v).toBe(10);
    expect(state?.items['energy-common']).toBe(stored);
  });

  it.each([[9, 3, 30], [10, 30, 30]])('액션 응답의 전체 상태(버전 %i)도 기운을 한 번만 옮긴다', async (v, raw, stored) => {
    vi.stubGlobal('fetch', async () => json({ state: { ...newState(), v, items: { 'energy-common': raw } }, version: 5 }));
    const res = await new HttpGameGateway().dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } });
    expect(res.status === 'ok' && res.state.items['energy-common']).toBe(stored);
  });

  it('버전 10 저장에서 시작한 뒤 액션 응답의 패치를 적용해도 기운에 다시 곱하지 않는다', async () => {
    me.value = serverSave(10, 30);
    const gw = new HttpGameGateway();
    await gw.load();
    const next = { ...newState(), items: { 'energy-common': 45 } };
    const patch: StatePatch = {
      version: 5, baseVersion: 4, scalars: pickScalars(next),
      writes: { instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [] },
    };
    vi.stubGlobal('fetch', async () => json({ patch, result: null }));
    const res = await gw.dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } });
    expect(res.status === 'ok' && res.state.items['energy-common']).toBe(45);
  });
});

describe('HttpGameGateway의 델타 동기화와 캐시 복구', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const emptyWrites: StatePatch['writes'] = {
    instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [],
  };
  const instRow = (uid: string, fishId = 'carp') => ({
    uid, fish_id: fishId, form: 'normal', size: 30,
    caught_at: '2026-01-01T00:00:00.000Z', spot: 'pond', judgment: 'good', slot: null, locked: false,
  });
  const serverSave = (opts: { version: number; gold: number; instances?: unknown[]; v?: number }) => ({
    cur: { data: { v: opts.v ?? 10 }, gold: opts.gold, fame: 0, boat: 0, rod: 1, version: opts.version },
    instances: opts.instances ?? [], records: [], counters: {}, clearedNamed: [], legacy: null,
  });

  it('델타 baseVersion과 로컬 캐시 버전이 다르면 패치를 적용하지 않고 전체 재동기화한다', async () => {
    me.value = serverSave({ version: 4, gold: 100, instances: [instRow('stale-fish')] });
    const gw = new HttpGameGateway();
    await gw.load();
    expect(me.calls).toBe(1);

    me.value = serverSave({ version: 6, gold: 500, instances: [instRow('fresh-fish')] });
    const mismatchedPatch: StatePatch = {
      version: 6, baseVersion: 5,
      scalars: pickScalars({ ...newState(), gold: 999 }),
      writes: emptyWrites,
    };
    vi.stubGlobal('fetch', async () => json({ patch: mismatchedPatch, result: { type: 'none' } }));

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(me.calls).toBe(2);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.state.gold).toBe(500);
      expect(res.state.bag.map(f => f.uid)).toEqual(['fresh-fish']);
    }

    const nextPatch: StatePatch = {
      version: 7, baseVersion: 6,
      scalars: pickScalars({ ...newState(), gold: 700 }),
      writes: emptyWrites,
    };
    vi.stubGlobal('fetch', async () => json({ patch: nextPatch, result: { type: 'none' } }));
    const nextRes = await gw.dispatch({ type: 'upgradeRod' });
    expect(me.calls).toBe(2);
    expect(nextRes.status).toBe('ok');
    if (nextRes.status === 'ok') {
      expect(nextRes.state.gold).toBe(700);
      expect(nextRes.state.bag.map(f => f.uid)).toEqual(['fresh-fish']);
    }
  });

  it('이관 폴백으로 버전이 없는 캐시 상태에서 델타를 받으면 전체 재동기화한다', async () => {
    me.value = {
      cur: null, instances: [], records: [], counters: {}, clearedNamed: [],
      legacy: { ...newState(), gold: 50 },
    };
    const gw = new HttpGameGateway();
    await gw.load();
    expect(me.calls).toBe(1);

    me.value = serverSave({ version: 2, gold: 150 });
    const patch: StatePatch = {
      version: 2, baseVersion: 1,
      scalars: pickScalars({ ...newState(), gold: 999 }),
      writes: emptyWrites,
    };
    vi.stubGlobal('fetch', async () => json({ patch, result: { type: 'none' } }));

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(me.calls).toBe(2);
    expect(res.status === 'ok' && res.state.gold).toBe(150);
  });

  it('델타 적용에 실패하면 캐시를 폐기하고 전체 재동기화로 복구한다', async () => {
    me.value = serverSave({ version: 4, gold: 100 });
    const gw = new HttpGameGateway();
    await gw.load();

    me.value = serverSave({ version: 5, gold: 300, instances: [instRow('reloaded-fish')] });
    const brokenPatch = { version: 5, baseVersion: 4, scalars: pickScalars(newState()), writes: null };
    vi.stubGlobal('fetch', async () => json({ patch: brokenPatch, result: { type: 'none' } }));

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(me.calls).toBe(2);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.state.gold).toBe(300);
      expect(res.state.bag.map(f => f.uid)).toEqual(['reloaded-fish']);
    }
  });

  it('델타 적용 실패 후 재동기화까지 실패해도 이전 캐시는 폐기되어 다음 패치에 재사용되지 않는다', async () => {
    me.value = serverSave({ version: 4, gold: 100, instances: [instRow('stale-fish')] });
    const gw = new HttpGameGateway();
    await gw.load();

    me.fn = async () => { throw new AppError('network', 'load failed'); };
    const brokenPatch = { version: 5, baseVersion: 4, scalars: pickScalars(newState()), writes: null };
    vi.stubGlobal('fetch', async () => json({ patch: brokenPatch, result: { type: 'none' } }));
    const err = await gw.dispatch({ type: 'upgradeRod' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('network');
    expect(me.calls).toBe(2);

    me.fn = null;
    me.value = serverSave({ version: 5, gold: 400, instances: [instRow('clean-fish')] });
    const sameBasePatch: StatePatch = {
      version: 5, baseVersion: 4,
      scalars: pickScalars({ ...newState(), gold: 999 }),
      writes: emptyWrites,
    };
    vi.stubGlobal('fetch', async () => json({ patch: sameBasePatch, result: { type: 'none' } }));
    const recovered = await gw.dispatch({ type: 'upgradeRod' });
    expect(me.calls).toBe(3);
    expect(recovered.status).toBe('ok');
    if (recovered.status === 'ok') {
      expect(recovered.state.gold).toBe(400);
      expect(recovered.state.bag.map(f => f.uid)).toEqual(['clean-fish']);
    }
  });
});

describe('HttpGameGateway의 409 충돌 복구', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const emptyWrites: StatePatch['writes'] = {
    instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [],
  };
  const instRow = (uid: string) => ({
    uid, fish_id: 'carp', form: 'normal', size: 30,
    caught_at: '2026-01-01T00:00:00.000Z', spot: 'pond', judgment: 'good', slot: null, locked: false,
  });
  const serverSave = (version: number, gold: number, instances: unknown[] = []) => ({
    cur: { data: { v: 10 }, gold, fame: 0, boat: 0, rod: 1, version },
    instances, records: [], counters: {}, clearedNamed: [], legacy: null,
  });

  it('409 충돌 뒤 상태를 재조회해 캐시를 최신화한 뒤 1회 재시도해 성공한다', async () => {
    const order: string[] = [];
    me.fn = async () => {
      order.push(`load:${me.calls}`);
      return me.calls === 1
        ? serverSave(4, 100, [instRow('old-fish')])
        : serverSave(5, 250, [instRow('latest-fish')]);
    };
    const gw = new HttpGameGateway();
    await gw.load();

    let fetchCalls = 0;
    vi.stubGlobal('fetch', async () => {
      fetchCalls++;
      order.push(`fetch:${fetchCalls}`);
      if (fetchCalls === 1) return json({ error: 'version-conflict' }, 409);
      const retryPatch: StatePatch = {
        version: 6, baseVersion: 5,
        scalars: pickScalars({ ...newState(), gold: 350 }),
        writes: emptyWrites,
      };
      return json({ patch: retryPatch, result: { type: 'none' } });
    });

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(order).toEqual(['load:1', 'fetch:1', 'load:2', 'fetch:2']);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.state.gold).toBe(350);
      expect(res.state.bag.map(f => f.uid)).toEqual(['latest-fish']);
    }
  });

  it('409 충돌 뒤 재조회가 실패해도 1회 재시도는 계속 진행한다', async () => {
    me.fn = async () => {
      if (me.calls === 1) return serverSave(4, 100);
      throw new AppError('network', 'load failed');
    };
    const gw = new HttpGameGateway();
    await gw.load();

    let fetchCalls = 0;
    vi.stubGlobal('fetch', async () => {
      fetchCalls++;
      if (fetchCalls === 1) return json({ error: 'version-conflict' }, 409);
      return json({ state: { ...newState(), gold: 500 }, version: 6, result: { type: 'none' } });
    });

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(fetchCalls).toBe(2);
    expect(me.calls).toBe(2);
    expect(res.status === 'ok' && res.state.gold).toBe(500);
  });

  it('재시도 뒤에도 409가 이어지면 추가 재시도 없이 server 실패를 던진다', async () => {
    me.value = serverSave(4, 100);
    const gw = new HttpGameGateway();
    await gw.load();

    let fetchCalls = 0;
    vi.stubGlobal('fetch', async () => {
      fetchCalls++;
      return json({ error: 'version-conflict' }, 409);
    });

    const err = await gw.dispatch({ type: 'upgradeRod' }).catch(e => e);
    expect(fetchCalls).toBe(2);
    expect(me.calls).toBe(2);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('server');
    expect((err as AppError).context).toMatchObject({ status: 409, error: 'version-conflict', action: 'upgradeRod' });
  });

  it('409 재조회 뒤 재시도에서 422 규칙 거부를 받으면 그대로 rejected를 돌려준다', async () => {
    me.value = serverSave(4, 100);
    const gw = new HttpGameGateway();
    await gw.load();

    let fetchCalls = 0;
    vi.stubGlobal('fetch', async () => {
      fetchCalls++;
      if (fetchCalls === 1) return json({ error: 'version-conflict' }, 409);
      return json({ error: 'not-enough-gold' }, 422);
    });

    const res = await gw.dispatch({ type: 'upgradeRod' });
    expect(fetchCalls).toBe(2);
    expect(me.calls).toBe(2);
    expect(res).toEqual({ status: 'rejected', error: 'not-enough-gold' });
  });
});

describe('HttpGameGateway의 오류·거부 응답 처리', () => {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it.each(['not-enough-gold', 'max-boat', 'cooking-busy', 'material-missing'] as const)(
    '422의 알려진 사유 %s는 그대로 돌려준다', async code => {
      vi.stubGlobal('fetch', async () => json({ error: code }, 422));
      const res = await new HttpGameGateway().dispatch({ type: 'buyBoat' });
      expect(res).toEqual({ status: 'rejected', error: code });
    });

  it.each([
    { label: 'unknown-reason', value: 'unknown-reason' },
    { label: '빈 문자열', value: '' },
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: '숫자 123', value: 123 },
    { label: '객체', value: { code: 'not-enough-gold' } },
    { label: 'toString', value: 'toString' },
    { label: 'constructor', value: 'constructor' },
    { label: 'valueOf', value: 'valueOf' },
    { label: 'hasOwnProperty', value: 'hasOwnProperty' },
  ])('422의 미등록·비문자열·프로토타입 사유($label)는 bad-request로 수렴한다', async ({ value }) => {
    vi.stubGlobal('fetch', async () => json(value === undefined ? {} : { error: value }, 422));
    const res = await new HttpGameGateway().dispatch({ type: 'buyBoat' });
    expect(res).toEqual({ status: 'rejected', error: 'bad-request' });
  });

  it('423 응답은 replaced 실패를 던진다', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'session-replaced' }, 423));
    const err = await new HttpGameGateway().dispatch({ type: 'buyBoat' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('replaced');
    expect((err as AppError).context).toEqual({ action: 'buyBoat' });
  });

  it('426 응답은 outdated 실패와 서버 버전 문맥을 던진다', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'version-mismatch', server: '1.2.3' }, 426));
    const err = await new HttpGameGateway().dispatch({ type: 'buyBoat' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('outdated');
    expect((err as AppError).context).toEqual({ server: '1.2.3' });
  });

  it('401 응답은 unauthorized 실패를 던진다', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'unauthorized' }, 401));
    const err = await new HttpGameGateway().dispatch({ type: 'buyBoat' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('unauthorized');
  });

  it.each<{ status: number; body: string; headers: Record<string, string> }>([
    { status: 200, body: '<html>fallback</html>', headers: { 'content-type': 'text/html; charset=utf-8' } },
    { status: 401, body: 'Unauthorized', headers: { 'content-type': 'text/plain' } },
    { status: 404, body: 'Not Found', headers: {} },
  ])('비JSON 응답(status $status)은 상태 분기보다 먼저 server 실패로 던진다', async ({ status, body, headers }) => {
    vi.stubGlobal('fetch', async () => new Response(body, { status, headers }));
    const err = await new HttpGameGateway().dispatch({ type: 'buyBoat' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('server');
    expect((err as AppError).context).toEqual({ status });
  });

  it('application/json 헤더여도 본문이 깨진 200 응답은 server 실패로 던진다', async () => {
    vi.stubGlobal('fetch', async () => new Response('{broken-json', {
      status: 200, headers: { 'content-type': 'application/json; charset=utf-8' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'buyBoat' }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('server');
    expect((err as AppError).context).toMatchObject({ status: 200, action: 'buyBoat' });
  });
});
