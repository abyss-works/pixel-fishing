// 서버의 403(제재 계정, 권한 없는 import 요청)은 거부 사유 코드와 무관하게 restricted 실패로 올라간다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';

vi.mock('./auth', () => ({ isCloud: true }));
const me = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('./me', () => ({ readMe: async () => me.value }));

import { newState } from '../../game/rules/logic';
import { pickScalars } from '../../game/rules/actions';
import type { StatePatch } from '../../game/rules/actions';
import { HttpGameGateway } from './httpGameGateway';

afterEach(() => { vi.unstubAllGlobals(); me.value = null; });

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
