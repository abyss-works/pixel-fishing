// API 계층 진입점 — 프론트는 backend/* 를 직접 import하지 않고 이 모듈만 본다
// supabase 유무에 따라 http/local 구현을 갈아끼운다 (useGame.ts:50 한 줄 분기가 여기로 이동)
// 게임 상태 변경은 backend/types.Backend 그대로, 인증·저장은 AuthApi/StorageApi로 통합
import { supabase } from '../backend/auth';
import type { GameState } from '../game/logic';
import { newState, migrate } from '../game/logic';
import { createHttpApi } from './http';
import { createLocalApi } from './local';
import type { ApiClient } from './types';

const LEGACY_KEY = 'pixel-fishing-save';

function loadLegacy(): { game: GameState; notice: string | null; legacy: boolean } {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const game = migrate(parsed);
      const notice = parsed?.v !== 4 && game.fame > 0
        ? `업데이트! 그동안 잡은 물고기가 명성으로 소급 인정되었다. 명성 ${game.fame}`
        : null;
      return { game, notice, legacy: true };
    }
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return { game: newState(), notice: null, legacy: false };
}

export function createApi(): ApiClient & { initial: ReturnType<typeof loadLegacy>; isLocal: boolean } {
  const initial = loadLegacy();
  const isLocal = !supabase;
  const impl = isLocal ? createLocalApi(initial.game) : createHttpApi();
  return {
    game: impl.game,
    auth: impl.auth,
    storage: impl.storage,
    isLocal,
    initial,
  };
}

// 편의를 위한 싱글톤 (테스트는 createApi()로 격리 생성)
export const api = createApi();

export { LEGACY_KEY };
export type { ApiClient } from './types';
