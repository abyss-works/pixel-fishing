import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_ORIGIN_KEY,
  SAIL_RETURN_KEY,
  SAIL_RETURN_TARGET,
  activateSailReturnIfPending,
  clearPendingGoogleOrigin,
  clearPendingSailReturn,
  consumeGoogleOrigin,
  consumeSailReturn,
  hasPendingSailReturn,
  isSailReturnReady,
  resetSailReturnForTest,
  setPendingGoogleOrigin,
  setPendingSailReturn,
} from './sailReturn';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

let storage: ReturnType<typeof createMemoryStorage>;

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('sessionStorage', storage);
  resetSailReturnForTest();
});

afterEach(() => {
  resetSailReturnForTest();
  vi.unstubAllGlobals();
});

describe('sailReturn 세션 표지', () => {
  it('출항 대기를 저장하고 조회한 뒤, 삭제하면 지워진다', () => {
    expect(hasPendingSailReturn()).toBe(false);
    setPendingSailReturn();
    expect(sessionStorage.getItem(SAIL_RETURN_KEY)).toBe(SAIL_RETURN_TARGET);
    expect(hasPendingSailReturn()).toBe(true);
    clearPendingSailReturn();
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('OAuth 복귀 성공으로 활성화된 뒤에만 consumeSailReturn이 true를 반환하고 1회 소비한다', () => {
    setPendingSailReturn();
    expect(isSailReturnReady()).toBe(false);
    expect(consumeSailReturn()).toBe(false);
    // 아직 활성화 전이라 세션 저장소 키가 남아 있다
    expect(hasPendingSailReturn()).toBe(true);

    expect(activateSailReturnIfPending()).toBe(true);
    expect(isSailReturnReady()).toBe(true);
    expect(consumeSailReturn()).toBe(true);
    expect(isSailReturnReady()).toBe(false);
    expect(hasPendingSailReturn()).toBe(false);
    expect(consumeSailReturn()).toBe(false);
  });

  it('대기가 없을 때 activateSailReturnIfPending은 false다', () => {
    expect(activateSailReturnIfPending()).toBe(false);
    expect(isSailReturnReady()).toBe(false);
  });

  it('구글 인증 시작 출처(connect/manage)를 저장하고 1회 소비하거나 삭제한다', () => {
    expect(consumeGoogleOrigin()).toBeNull();
    setPendingGoogleOrigin('manage');
    expect(sessionStorage.getItem(GOOGLE_ORIGIN_KEY)).toBe('manage');
    expect(consumeGoogleOrigin()).toBe('manage');
    expect(consumeGoogleOrigin()).toBeNull();

    setPendingGoogleOrigin('connect');
    clearPendingGoogleOrigin();
    expect(consumeGoogleOrigin()).toBeNull();
  });
});
