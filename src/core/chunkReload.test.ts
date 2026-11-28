import { describe, it, expect, vi } from 'vitest';
import { installChunkReloadGuard } from './chunkReload.ts';

function createFakeWindow() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const reload = vi.fn();

  return {
    window: {
      addEventListener(type: string, listener: (event: Event) => void) {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(listener);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      },
      location: { reload },
    },
    emit(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event as Event);
      }
    },
    reload,
  };
}

function createFakeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('installChunkReloadGuard', () => {
  it('첫 vite:preloadError 발생 시 preventDefault와 reload()를 1회 호출한다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage();
    const preventDefault = vi.fn();

    installChunkReloadGuard(fake.window, storage, () => 1_000);
    fake.emit('vite:preloadError', { preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fake.reload).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith('pf:chunk-reload-at', '1000');
  });

  it('동적 임포트 실패 unhandledrejection 시 reload()를 1회 호출한다', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://example.com/assets/app.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://example.com/assets/chunk.js',
    ]) {
      const fake = createFakeWindow();
      const storage = createFakeStorage();

      installChunkReloadGuard(fake.window, storage, () => 2_000);
      fake.emit('unhandledrejection', { reason: new TypeError(message) });

      expect(fake.reload, message).toHaveBeenCalledOnce();
    }
  });

  it('동적 청크 로드가 아닌 일반 unhandledrejection은 무시한다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage();

    installChunkReloadGuard(fake.window, storage, () => 2_000);
    fake.emit('unhandledrejection', { reason: new Error('network timeout') });
    fake.emit('unhandledrejection', { reason: 'plain string error' });
    fake.emit('unhandledrejection', {});

    expect(fake.reload).not.toHaveBeenCalled();
  });

  it('30초 쿨다운 내 2차 발생 시 reload()를 추가 호출하지 않는다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage();
    let nowMs = 10_000;

    installChunkReloadGuard(fake.window, storage, () => nowMs);

    fake.emit('vite:preloadError', {});
    expect(fake.reload).toHaveBeenCalledTimes(1);

    nowMs = 39_999;
    fake.emit('unhandledrejection', {
      reason: new TypeError('Failed to fetch dynamically imported module: /a.js'),
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  it('새로고침 후 새 페이지 수명에서도 30초 쿨다운 내면 reload()하지 않는다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage({ 'pf:chunk-reload-at': '10000' });

    installChunkReloadGuard(fake.window, storage, () => 25_000);
    fake.emit('vite:preloadError', {});

    expect(fake.reload).not.toHaveBeenCalled();
  });

  it('30초 경과 후 재발생 시 다시 1회 복구한다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage();
    let nowMs = 10_000;

    installChunkReloadGuard(fake.window, storage, () => nowMs);

    fake.emit('vite:preloadError', {});
    expect(fake.reload).toHaveBeenCalledTimes(1);

    nowMs = 40_000;
    fake.emit('vite:preloadError', {});
    expect(fake.reload).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenLastCalledWith('pf:chunk-reload-at', '40000');
  });

  it('sessionStorage.getItem과 setItem이 예외를 던져도 안전하게 동작하고 메모리 폴백으로 무한 루프를 막는다', () => {
    const fake = createFakeWindow();
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
    };
    let nowMs = 5_000;

    installChunkReloadGuard(fake.window, throwingStorage, () => nowMs);

    expect(() => fake.emit('vite:preloadError', {})).not.toThrow();
    expect(fake.reload).toHaveBeenCalledTimes(1);

    nowMs = 6_000;
    expect(() =>
      fake.emit('unhandledrejection', {
        reason: new Error('Importing a module script failed.'),
      }),
    ).not.toThrow();
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  it('반환된 해제 함수를 호출하면 리스너가 제거된다', () => {
    const fake = createFakeWindow();
    const storage = createFakeStorage();

    const dispose = installChunkReloadGuard(fake.window, storage, () => 1_000);
    dispose();

    fake.emit('vite:preloadError', {});
    fake.emit('unhandledrejection', {
      reason: new TypeError('Failed to fetch dynamically imported module'),
    });

    expect(fake.reload).not.toHaveBeenCalled();
  });
});
