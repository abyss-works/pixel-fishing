// 개발 계정 도구 API 계층 규약 검증 — 싱글톤과 로컬 팩토리가 같은 DevApi 계약을 노출하고 로컬 저장소를 초기화한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../game/rules/logic';
import { createLocalApi } from '../adapters/localApi';
import { api } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dev 계층 규약', () => {
  it('싱글톤과 로컬 팩토리 모두 DevApi 메서드를 노출한다', () => {
    const local = createLocalApi().dev;
    for (const m of ['promoteTestAccount', 'resetDevAccount'] as const) {
      expect(typeof api.dev[m]).toBe('function');
      expect(typeof local[m]).toBe('function');
    }
  });

  it('local 모드 — promoteTestAccount는 로컬 개발 계정을 돌려주고 resetDevAccount는 로컬 저장소를 newState()로 초기화한다', async () => {
    const store = new Map<string, string>([['pixel-fishing-save', JSON.stringify({ ...newState(), gold: 9999 })]]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });

    const { dev } = createLocalApi();
    await expect(dev.promoteTestAccount()).resolves.toEqual({
      ok: true,
      email: 'dev@localhost',
      isAnonymous: false,
    });

    const reset = await dev.resetDevAccount();
    expect(reset).toEqual({ state: newState(), version: 1 });
    expect(JSON.parse(store.get('pixel-fishing-save') ?? 'null')).toEqual(newState());
  });

  it('local 모드 — localStorage 쓰기가 실패해도 resetDevAccount는 초기 상태를 돌려준다', async () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('quota exceeded'); },
    });
    const { dev } = createLocalApi();
    await expect(dev.resetDevAccount()).resolves.toEqual({ state: newState(), version: 1 });
  });
});
