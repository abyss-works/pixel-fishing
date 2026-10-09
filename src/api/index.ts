// API 계층 진입점 — 프론트는 backend/* 를 직접 import하지 않고 이 모듈만 본다
// (경계는 api/boundary.test.ts가 강제한다 — 로컬/운영 두 오리진의 데이터 접근 일원화).
// supabase 유무에 따라 http/local 구현을 갈아끼운다: 게임 백엔드는 createGame 팩토리
// (마운트마다 생성 — LocalBackend가 상태를 들고 있어 싱글톤이면 테스트 간 상태가 샌다),
// 인증·저장은 AuthApi/StorageApi, 관리자 읽기는 AdminApi(0010 뷰/RPC — local은 판정만 'local')
import { supabase, saveCode } from '../backend/auth';
import type { GameState } from '../game/logic';
import { newState, migrate } from '../game/logic';
import { createHttpApi } from './http';
import { createLocalApi } from './local';
import type { ApiClient, StorageApi } from './types';

const LEGACY_KEY = 'pixel-fishing-save';

/** 레거시 localStorage 세이브를 메모리로 1회 이관 (쓰기는 하지 않음).
    호출 시점에 읽는다 — 모듈 로드 시점 고정이면 테스트의 localStorage 시딩이 안 보인다 */
export function loadLegacy(): { game: GameState; notice: string | null; legacy: boolean } {
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

// 이사 코드 인코딩은 http/local이 동일하다 — 구현 한 벌만 둔다
const storage: StorageApi = { saveCode };

export function createApi(): ApiClient {
  const impl = supabase ? createHttpApi() : createLocalApi();
  return { ...impl, storage };
}

// 편의를 위한 싱글톤 (테스트는 createApi()로 격리 생성)
export const api = createApi();

export { LEGACY_KEY };
// 백엔드 경계의 공용 헬퍼·타입도 여기서만 내보낸다 (backend/* 직접 import 금지)
export { when } from '../backend/types';
export { readBounty, kstDay } from './bounty';
export type { BountySnapshot, BountyProgressRow } from './bounty';
export type { Backend, MaybePromise, DispatchResult } from '../backend/types';
export type {
  ApiClient, AuthApi, StorageApi, AdminApi, AdminAccessResult,
  AdminUserRow, AdminDailyActiveRow, AdminRetentionRow, AdminEconomyRow,
  AdminCatchQualityRow, AdminSpamFlagRow, AdminImportLogRow,
  AdminDexMismatchRow, AdminEventRow, AdminLetterRow,
} from './types';
