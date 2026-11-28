const CHUNK_RELOAD_STORAGE_KEY = 'pf:chunk-reload-at';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unable to preload css',
] as const;

export interface ChunkReloadWindow {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  location: { reload(): void };
}

export interface ChunkReloadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function extractReasonMessage(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return `${reason.name} ${reason.message}`;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const msg = (reason as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return '';
}

function isChunkLoadFailure(reason: unknown): boolean {
  const message = extractReasonMessage(reason).toLowerCase();
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function readLastReloadAt(
  storage: ChunkReloadStorage | null | undefined,
  memoryLastReloadAt: number | null,
): number | null {
  let storedAt: number | null = null;
  try {
    const raw = storage?.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (raw !== null && raw !== undefined && raw !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) storedAt = parsed;
    }
  } catch {
    // 프라이빗 모드 또는 저장소 보안 차단 시 메모리 폴백을 사용한다
  }

  if (storedAt !== null && memoryLastReloadAt !== null) {
    return Math.max(storedAt, memoryLastReloadAt);
  }
  return storedAt ?? memoryLastReloadAt;
}

function writeLastReloadAt(
  storage: ChunkReloadStorage | null | undefined,
  timestamp: number,
): void {
  try {
    storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(timestamp));
  } catch {
    // 저장소 쓰기 실패 시에도 메모리 폴백이 같은 페이지 수명 내 루프를 차단한다
  }
}

/**
 * 배포 직후 구버전 해시 청크 로드 실패 시 1회 새로고침으로 복구하고,
 * 쿨다운 내 반복 실패는 무시해 무한 새로고침 루프를 막는다.
 */
export function installChunkReloadGuard(
  win: ChunkReloadWindow,
  storage: ChunkReloadStorage | null | undefined,
  now: () => number = Date.now,
): () => void {
  let memoryLastReloadAt: number | null = null;

  const tryReloadOnce = () => {
    const currentNow = now();
    const lastReloadAt = readLastReloadAt(storage, memoryLastReloadAt);
    if (lastReloadAt !== null && currentNow - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return;
    }
    memoryLastReloadAt = currentNow;
    writeLastReloadAt(storage, currentNow);
    win.location.reload();
  };

  const onPreloadError = (event: Event) => {
    (event as { preventDefault?: () => void }).preventDefault?.();
    tryReloadOnce();
  };

  const onUnhandledRejection = (event: Event) => {
    const reason = (event as { reason?: unknown }).reason;
    if (!isChunkLoadFailure(reason)) return;
    tryReloadOnce();
  };

  win.addEventListener('vite:preloadError', onPreloadError);
  win.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError);
    win.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
